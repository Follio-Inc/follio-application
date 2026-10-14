'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type {
  EntityComparison,
  FieldDifference,
  ParserRun,
  ResumeComparisonResult,
} from '../labs/resume-import-ai/comparison-types';
import type {
  ResumeLabAi,
  ResumeLabEntities,
  ResumeLabMissingPayload,
  ResumeLabPayload,
  ResumeLabRunResult,
  ResumeLabStage,
  ResumeLabView,
  ResumeLabWarning,
} from '../labs/resume-import-ai/types';

/**
 * The resume lab (PLATFORM_TODO item 21).
 *
 * A client component because it has two controls — pick a fixture, or choose a
 * file — and posts them to the lab's own route. It renders what comes back and
 * computes nothing of its own: every number below was measured on the server
 * during one run of the shipped pipeline.
 *
 * It deliberately does not look like the product importer. There is no "save",
 * no profile preview and no success copy about a finished import: the run ends
 * at the diagnostic, and the page says so in three places.
 *
 * Item 22 added four sections — AI usage and cost, entities, warnings and raw
 * payloads. They render what the server decided; the component does no
 * arithmetic of its own, so a token count, a dollar figure or a warning on
 * this page is the one the run produced.
 */

const RUN_ROUTE = '/api/admin/platform/labs/resume-import-ai/run';
const COMPARE_ROUTE = '/api/admin/platform/labs/resume-import-ai/compare';

type Phase =
  | { state: 'idle' }
  | { state: 'running'; what: string }
  | { state: 'done'; result: ResumeLabRunResult }
  | { state: 'compared'; result: ResumeComparisonResult };

function Count({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint !== undefined && (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function StageRow({ stage }: { stage: ResumeLabStage }) {
  const nested = stage.id.startsWith('agent:');

  return (
    <li className={cn('flex flex-wrap items-baseline gap-2 border-t px-4 py-1.5 first:border-t-0')}>
      <span className={cn('text-xs', nested ? 'pl-4 text-muted-foreground' : 'font-medium')}>
        {stage.label.trim()}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{stage.ms} ms</span>
      <span className="text-[11px] text-muted-foreground">{stage.detail}</span>
    </li>
  );
}

/** A dollar figure, or the reason there is not one. Never "$0.00" for unknown. */
function usd(value: number | null): string {
  if (value === null) return 'unknown';
  // Four decimals: a resume parse costs fractions of a cent, and rounding to
  // two would print $0.00 for a real charge.
  return `$${value.toFixed(4)}`;
}

/**
 * AI usage and cost (item 22).
 *
 * The section's job is to keep three things apart that all look like a
 * number: what the provider reported, what the `AgentRun` row recorded, and
 * what either of them cost. The `AgentRun` zero gets its own line with its
 * own explanation, because it is the one most likely to be misread.
 */
function AiUsage({ ai, agentRunId }: { ai: ResumeLabAi; agentRunId: string | null }) {
  const { usage, cost } = ai;
  const observed = usage.status === 'observed';

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex flex-wrap items-baseline gap-2 px-4 py-2">
        <p className="text-xs font-medium">AI usage</p>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            observed
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : usage.status === 'estimated'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          {usage.status}
        </span>
        {ai.models.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{ai.models.join(' · ')}</span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2 border-t p-3 sm:grid-cols-4">
        <Count
          label="Input tokens"
          value={usage.inputTokens === null ? 'unavailable' : String(usage.inputTokens)}
        />
        <Count
          label="Output tokens"
          value={usage.outputTokens === null ? 'unavailable' : String(usage.outputTokens)}
        />
        <Count
          label="Total tokens"
          value={usage.totalTokens === null ? 'unavailable' : String(usage.totalTokens)}
        />
        <Count
          label="Estimated cost"
          value={usd(cost.totalUsd)}
          hint={cost.status === 'available' ? undefined : cost.status}
        />
      </div>

      <p className="px-4 pb-1 text-[11px] text-muted-foreground">{usage.source}</p>
      <p className="px-4 pb-2 text-[11px] text-muted-foreground">
        {cost.note}
        {cost.pricingSource !== null && <> {cost.pricingSource}</>}
      </p>

      {usage.calls.length > 0 && (
        <ul className="border-t">
          {usage.calls.map((call, index) => (
            <li
              key={`${call.stage}-${index}`}
              className="flex flex-wrap items-baseline gap-2 border-t px-4 py-1.5 first:border-t-0"
            >
              <span className="text-xs font-medium">{call.label}</span>
              <code className="font-mono text-[11px] text-muted-foreground">{call.stage}</code>
              <span className="text-[11px] text-muted-foreground">{call.model}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {call.inputTokens} in · {call.outputTokens} out · {call.durationMs} ms
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {usd(call.cost.totalUsd)}
              </span>
              {call.maxOutputTokens !== null && (
                <span className="text-[10px] text-muted-foreground">
                  cap {call.maxOutputTokens}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t px-4 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          AgentRun recorded: {usage.agentRunRecorded.input} input / {usage.agentRunRecorded.output}{' '}
          output
          {agentRunId !== null && (
            <>
              {' · '}
              <code className="font-mono">{agentRunId}</code>
            </>
          )}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {usage.agentRunNote}
        </p>
      </div>
    </section>
  );
}

/** Entity counts from the parsed structure, with the counting rule attached. */
function Entities({ entities }: { entities: ResumeLabEntities }) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="flex flex-wrap items-baseline gap-2 px-4 py-2">
        <p className="text-xs font-medium">Entities</p>
        <span className="text-xs font-semibold tabular-nums">{entities.total} total</span>
      </header>
      <div className="grid grid-cols-3 gap-2 border-t p-3 sm:grid-cols-5">
        {entities.byType.map((entry) => (
          <Count key={entry.type} label={entry.label} value={String(entry.count)} />
        ))}
      </div>
      {entities.nested.length > 0 && (
        <p className="px-4 pb-1 text-[11px] text-muted-foreground">
          Nested, and not in the total:{' '}
          {entities.nested.map((entry) => `${entry.label} ${entry.count}`).join(' · ')}
        </p>
      )}
      <p className="px-4 pb-2 text-[11px] leading-snug text-muted-foreground">{entities.rule}</p>
    </section>
  );
}

/** Deterministic diagnostics, or the fact that there are none. */
function Warnings({ warnings, ran }: { warnings: ResumeLabWarning[]; ran: boolean }) {
  if (warnings.length === 0) {
    return (
      <section className="rounded-lg border bg-background px-4 py-2">
        <p className="text-xs font-medium">Warnings</p>
        <p className="text-[11px] text-muted-foreground">
          {ran
            ? 'None. Every rule was evaluated against this run and none of them fired.'
            : 'None recorded: the run stopped before the checks had anything to read.'}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-background">
      <header className="px-4 py-2">
        <p className="text-xs font-medium">Warnings ({warnings.length})</p>
        <p className="text-[11px] text-muted-foreground">
          Fixed rules over this run&rsquo;s own numbers. Nothing here was generated by a model.
        </p>
      </header>
      <ul className="border-t">
        {/* Keyed by position: item 23 raises one `section-ai-only` per
            section, so a code is not unique within a list. */}
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className="border-t px-4 py-1.5 first:border-t-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  warning.severity === 'error'
                    ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                    : warning.severity === 'warning'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {warning.severity}
              </span>
              <code className="font-mono text-[11px]">{warning.code}</code>
              {warning.evidence !== null && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {warning.evidence}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {warning.message}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Diagnostic text and JSON from the run, collapsed by default.
 *
 * Each entry reports the whole value's size even when the preview is capped,
 * so a truncated view never understates what the pipeline handled. What is
 * absent is listed too, with the reason — the alternative would be re-running
 * a stage to manufacture a payload, which would be a different call.
 */
function Payloads({
  payloads,
  missing,
}: {
  payloads: ResumeLabPayload[];
  missing: ResumeLabMissingPayload[];
}) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="px-4 py-2">
        <p className="text-xs font-medium">Raw payloads</p>
        <p className="text-[11px] text-muted-foreground">
          Held in this response only — never written to disk, never logged, never stored. Prompts,
          provider exchanges and the uploaded bytes are not here by design.
        </p>
      </header>
      {payloads.map((payload) => (
        <details key={payload.id} className="border-t px-4 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {payload.label}{' '}
            <span className="font-normal tabular-nums">
              · {payload.kind} · {payload.stage} · {payload.chars} ch / {payload.bytes} B
              {payload.truncated && ` · preview truncated to ${payload.preview.length} ch`}
            </span>
          </summary>
          <p className="mt-1 text-[11px] text-muted-foreground">{payload.note}</p>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {payload.preview}
          </pre>
          {payload.truncated && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              Truncated. The full value is {payload.chars} characters; the sizes above describe all
              of it.
            </p>
          )}
        </details>
      ))}
      {missing.length > 0 && (
        <div className="border-t px-4 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">Not available, and why</p>
          <ul className="mt-1 space-y-1">
            {missing.map((entry) => (
              <li key={entry.id} className="text-[11px] leading-snug text-muted-foreground">
                <span className="font-medium">{entry.label}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Result({ result }: { result: ResumeLabRunResult }) {
  const good = result.outcome === 'parsed';
  const { sizes, retention, tokens, parsed } = result;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-lg border px-4 py-3',
          good ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              good
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
            )}
          >
            {result.outcome}
          </span>
          <span className="text-sm">
            {result.source} · <code className="font-mono text-xs">{result.inputLabel}</code>
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {result.timing.totalMs} ms total
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{result.detail}</p>
        {result.error !== null && (
          <p className="mt-1 break-words font-mono text-[11px] text-red-700 dark:text-red-400">
            {result.error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Count label="Input" value={`${sizes.inputBytes} B`} hint="the PDF" />
        <Count label="Pages" value={sizes.pages === null ? '—' : String(sizes.pages)} />
        <Count
          label="Extracted"
          value={`${sizes.extractedChars} ch`}
          hint={`${sizes.extractedBytes} B utf-8`}
        />
        <Count label="To the parser" value={`${sizes.parserInputChars} ch`} />
        <Count
          label="Dropped"
          value={retention === null ? '—' : `${retention.droppedChars} ch`}
          hint={retention === null ? undefined : `${retention.keptPercent}% kept`}
        />
        <Count
          label="Parsed JSON"
          value={sizes.parsedJsonChars === null ? '—' : `${sizes.parsedJsonChars} ch`}
        />
      </div>

      {retention !== null && (
        <p className="max-w-3xl text-xs text-muted-foreground">{retention.note}</p>
      )}

      <section className="rounded-lg border bg-background">
        <header className="px-4 py-2">
          <p className="text-xs font-medium">Per stage</p>
          <p className="text-[11px] text-muted-foreground">
            Measured with a monotonic clock. The indented rows are the agent&rsquo;s own step
            timings, reported rather than re-measured from outside.
          </p>
        </header>
        <ul className="border-t">
          {result.timing.stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </ul>
      </section>

      {result.ai !== null && tokens !== null && (
        <AiUsage ai={result.ai} agentRunId={result.agentRunId} />
      )}

      {result.entities !== null && <Entities entities={result.entities} />}

      <Warnings warnings={result.warnings} ran={good} />

      {parsed !== null && (
        <section className="rounded-lg border bg-background">
          <header className="px-4 py-2">
            <p className="text-xs font-medium">
              Parsed result — not saved, and not written anywhere
            </p>
            <p className="text-[11px] text-muted-foreground">
              {parsed.model !== null && <>model {parsed.model} · </>}
              {parsed.confidence !== null && <>confidence {parsed.confidence} · </>}
              headline {parsed.headline === null ? 'none' : `“${parsed.headline}”`} · summary{' '}
              {parsed.summaryChars} ch
            </p>
          </header>
          <details className="border-t px-4 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Normalized JSON
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {parsed.json}
            </pre>
          </details>
        </section>
      )}

      {result.payloads.length > 0 && (
        <Payloads payloads={result.payloads} missing={result.missingPayloads} />
      )}
    </div>
  );
}

/** One side of a comparison, on its own terms (item 23). */
function ParserCard({ run }: { run: ParserRun }) {
  const ok = run.outcome === 'parsed';

  return (
    <section className="rounded-lg border bg-background">
      <header className="flex flex-wrap items-baseline gap-2 px-4 py-2">
        <p className="text-xs font-medium">{run.side === 'ai' ? 'AI pipeline' : 'OpenResume'}</p>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            ok
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-500/10 text-red-700 dark:text-red-400'
          )}
        >
          {run.outcome}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{run.durationMs} ms</span>
        {run.confidence !== null && (
          <span className="text-[11px] text-muted-foreground">
            self-reported confidence {run.confidence}
          </span>
        )}
      </header>

      <p className="px-4 pb-1 text-[11px] text-muted-foreground">
        <code className="font-mono">{run.implementation}</code>
      </p>
      <p className="px-4 pb-2 text-[11px] leading-snug text-muted-foreground">{run.note}</p>

      {run.error !== null && (
        <p className="border-t px-4 py-2 text-[11px] text-red-700 dark:text-red-400">{run.error}</p>
      )}

      {run.entities !== null && (
        <div className="grid grid-cols-3 gap-2 border-t p-3 sm:grid-cols-5">
          {run.entities.byType.map((entry) => (
            <Count key={entry.type} label={entry.label} value={String(entry.count)} />
          ))}
        </div>
      )}

      <div className="border-t px-4 py-2">
        {run.ai !== null ? (
          <p className="text-[11px] text-muted-foreground">
            {run.ai.usage.status === 'observed'
              ? `${run.ai.usage.totalTokens} tokens observed · ${run.ai.models.join(', ')} · ${
                  run.ai.cost.totalUsd === null
                    ? 'cost unknown'
                    : `$${run.ai.cost.totalUsd.toFixed(4)}`
                }`
              : `Token telemetry ${run.ai.usage.status}; cost unknown for this run.`}
          </p>
        ) : (
          // Not "$0.00": a parser that calls no model has no provider cost,
          // which is a different statement from a cost of zero.
          <p className="text-[11px] text-muted-foreground">{run.aiNote}</p>
        )}
      </div>

      {run.stages.length > 0 && (
        <ul className="border-t">
          {run.stages.map((stage) => (
            <li
              key={stage.id}
              className="flex flex-wrap items-baseline gap-2 border-t px-4 py-1 first:border-t-0"
            >
              <span className="text-[11px]">{stage.label}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{stage.ms} ms</span>
              <span className="text-[10px] text-muted-foreground">{stage.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {run.json !== null && (
        <details className="border-t px-4 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {run.side === 'ai' ? 'AI' : 'OpenResume'} normalized JSON{' '}
            <span className="font-normal tabular-nums">· {run.json.length} ch</span>
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {run.json}
          </pre>
        </details>
      )}
    </section>
  );
}

function stateClass(state: FieldDifference['state']): string {
  if (state === 'same') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (state === 'different') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (state === 'not-comparable') return 'bg-muted text-muted-foreground';
  return 'bg-sky-500/10 text-sky-700 dark:text-sky-400';
}

function EntityTable({ entities }: { entities: EntityComparison[] }) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="px-4 py-2">
        <p className="text-xs font-medium">Entity comparison</p>
        <p className="text-[11px] text-muted-foreground">
          Records match on the key named in each row, after trimming, lower-casing and collapsing
          whitespace. Nothing fuzzy, and no model was asked whether two records mean the same thing.
        </p>
      </header>
      <div className="overflow-x-auto border-t">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[11px] text-muted-foreground">
              <th className="px-4 py-1.5 font-medium">Section</th>
              <th className="px-2 py-1.5 font-medium tabular-nums">AI</th>
              <th className="px-2 py-1.5 font-medium tabular-nums">OpenResume</th>
              <th className="px-2 py-1.5 font-medium tabular-nums">Overlap</th>
              <th className="px-2 py-1.5 font-medium tabular-nums">AI only</th>
              <th className="px-2 py-1.5 font-medium tabular-nums">OR only</th>
              <th className="px-4 py-1.5 font-medium">Matched on</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entry) => (
              <tr key={entry.type} className="border-b last:border-b-0">
                <td className="px-4 py-1.5">{entry.label}</td>
                <td className="px-2 py-1.5 tabular-nums">{entry.aiCount}</td>
                <td className="px-2 py-1.5 tabular-nums">{entry.openResumeCount}</td>
                <td className="px-2 py-1.5 font-medium tabular-nums">{entry.overlap}</td>
                <td className="px-2 py-1.5 tabular-nums">{entry.aiOnly}</td>
                <td className="px-2 py-1.5 tabular-nums">{entry.openResumeOnly}</td>
                <td className="px-4 py-1.5 text-[11px] text-muted-foreground">{entry.matchRule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FieldTable({ fields }: { fields: FieldDifference[] }) {
  return (
    <section className="rounded-lg border bg-background">
      <header className="px-4 py-2">
        <p className="text-xs font-medium">Field differences</p>
      </header>
      <ul className="border-t">
        {fields.map((field) => (
          <li key={field.field} className="border-t px-4 py-1.5 first:border-t-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-medium">{field.label}</span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  stateClass(field.state)
                )}
              >
                {field.state}
              </span>
            </div>
            <dl className="mt-1 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">AI</dt>
                <dd className="break-words text-[11px]">{field.ai ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  OpenResume
                </dt>
                <dd className="break-words text-[11px]">{field.openResume ?? '—'}</dd>
              </div>
            </dl>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{field.rule}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A comparison result (item 23).
 *
 * There is no winner and no score, deliberately: the numbers are shown side
 * by side and the judgement is the reader's.
 */
function Comparison({ result }: { result: ResumeComparisonResult }) {
  const { comparison } = result;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Comparison</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {result.outcome}
          </span>
          <span className="text-xs text-muted-foreground">
            {result.source} · <code className="font-mono text-xs">{result.inputLabel}</code>
          </span>
          {comparison !== null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {comparison.summary.totalMs} ms total
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{result.detail}</p>
        {comparison !== null && (
          <>
            <p className="mt-2 max-w-3xl text-[11px] text-muted-foreground">
              Both parsers received the same {comparison.summary.sourceBytes}-byte document — sha256{' '}
              <code className="font-mono">{comparison.summary.sourceSha256.slice(0, 16)}…</code>.
              They extract it differently inside, which is a difference between the parsers rather
              than one the lab introduced.
            </p>
            <p className="mt-1 max-w-3xl text-[11px] text-muted-foreground">
              {comparison.summary.executionNote}
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {result.ai !== null && <ParserCard run={result.ai} />}
        {result.openResume !== null && <ParserCard run={result.openResume} />}
      </div>

      {comparison !== null && <EntityTable entities={comparison.entities} />}
      {comparison !== null && <FieldTable fields={comparison.fields} />}

      <Warnings warnings={result.warnings} ran />

      {comparison !== null && (
        <section className="rounded-lg border bg-background px-4 py-2">
          <p className="text-xs font-medium">Not comparable</p>
          <ul className="mt-1 space-y-1">
            {comparison.uncomparable.map((entry) => (
              <li key={entry.field} className="text-[11px] leading-snug text-muted-foreground">
                <code className="font-mono">{entry.field}</code>{' '}
                <span className="uppercase tracking-wide">({entry.side})</span> — {entry.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {comparison.projectionNote}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            No winner and no score: these are two sets of numbers, and which parser is better for a
            given document is a judgement this page deliberately leaves to you.
          </p>
        </section>
      )}
    </div>
  );
}

export function ResumeLab({ view }: { view: ResumeLabView }) {
  const [fixtureId, setFixtureId] = useState(view.fixtures[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const post = async (body: FormData, what: string, mode: 'run' | 'compare') => {
    setError(null);
    setPhase({ state: 'running', what });
    try {
      const response = await fetch(mode === 'run' ? RUN_ROUTE : COMPARE_ROUTE, {
        method: 'POST',
        body,
      });
      const payload = (await response.json().catch(() => null)) as
        | ResumeLabRunResult
        | ResumeComparisonResult
        | { error?: string }
        | null;

      // A refused run comes back as 409 with a full result; it is rendered,
      // because why it refused is the useful part.
      if (payload !== null && 'outcome' in payload) {
        setPhase(
          mode === 'run'
            ? { state: 'done', result: payload as ResumeLabRunResult }
            : { state: 'compared', result: payload as ResumeComparisonResult }
        );
        return;
      }
      setError(
        (payload as { error?: string } | null)?.error ??
          (mode === 'compare' && response.status === 500
            ? // Worth naming rather than leaving as a bare 500: the legacy
              // parser spawns `node scripts/parse-pdf.cjs`, and Turbopack —
              // what `npm run dev` runs — cannot resolve that path, so this
              // one endpoint fails to compile there. The rest of the lab is
              // unaffected, and the comparison works under `next dev`
              // without `--turbo` and in a production build.
              'The comparison endpoint is unavailable under Turbopack. The OpenResume parser spawns a child process, and Turbopack cannot resolve its script path. Everything else on this page works; restart the dev server with `npm run dev:webpack` to use the comparison. Build and production are unaffected.'
            : `The request failed with HTTP ${response.status}.`)
      );
      setPhase({ state: 'idle' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be sent.');
      setPhase({ state: 'idle' });
    }
  };

  const fixtureBody = () => {
    const body = new FormData();
    body.set('fixtureId', fixtureId);
    return body;
  };

  const uploadBody = (chosen: File) => {
    const body = new FormData();
    body.set('file', chosen);
    return body;
  };

  const runFixture = () => void post(fixtureBody(), `fixture ${fixtureId}`, 'run');

  const runUpload = () => {
    if (file === null) return;
    void post(uploadBody(file), file.name, 'run');
  };

  const compare = () => {
    if (file !== null) {
      void post(uploadBody(file), file.name, 'compare');
      return;
    }
    void post(fixtureBody(), `fixture ${fixtureId}`, 'compare');
  };

  const running = phase.state === 'running';

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Resume import lab</h2>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Diagnostic only
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Runs the <strong>shipped</strong> resume-import pipeline once and measures it:{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">extractTextFromPDF</code> and then{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">runResumeParseAgent</code>, the
          same two calls{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">importResumeWithAI</code> makes.{' '}
          <strong>Nothing is saved to Follio</strong>: no profile, no resume row, no product write —
          the agent&rsquo;s save step is skipped because the flag is never passed. Same PDF limits
          as the product route: {Math.round(view.maxBytes / (1024 * 1024))} MB, PDF only.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          A run does call the AI provider and so costs tokens, and the shipped agent runtime writes
          one <code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentRun</code> telemetry
          row per run, exactly as a product import does. Uploaded bytes stay in memory for the
          request and are never written to disk or the database.
        </p>
      </header>

      {!view.canRun && (
        <section className="rounded-xl border border-dashed bg-card p-5">
          <h3 className="text-sm font-semibold">Running the lab is unavailable here</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{view.gateReason}</p>
        </section>
      )}

      {view.canRun && !view.aiAvailable && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <h3 className="text-sm font-semibold">No AI provider is configured</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The parse step cannot run without a key, and the product route refuses at the same
            point. Extraction would still work; the run will stop before the agent and say so.
          </p>
        </section>
      )}

      {view.canRun && (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Fixture
              </span>
              <select
                value={fixtureId}
                onChange={(event) => setFixtureId(event.target.value)}
                disabled={running || view.fixtures.length === 0}
                className="h-9 max-w-md rounded-md border bg-background px-2 text-sm disabled:opacity-60"
              >
                {view.fixtures.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.id} — {fixture.label}
                    {fixture.bytes !== null && ` (${fixture.bytes} B)`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={runFixture}
              disabled={running || fixtureId === ''}
              className={cn(
                'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {running ? 'Running…' : 'Run the fixture'}
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Or a PDF of your own
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={running}
                className="h-9 max-w-md rounded-md border bg-background px-2 py-1 text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs disabled:opacity-60"
              />
            </label>

            <button
              type="button"
              onClick={runUpload}
              disabled={running || file === null}
              className={cn(
                'h-9 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {running ? 'Running…' : 'Run the upload'}
            </button>

            {file !== null && (
              <span className="text-xs text-muted-foreground">
                {file.name} · {file.size} B
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <button
              type="button"
              onClick={compare}
              disabled={running || (file === null && fixtureId === '')}
              className={cn(
                'h-9 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {running ? 'Running…' : 'Compare AI vs OpenResume'}
            </button>
            <p className="max-w-2xl text-[11px] text-muted-foreground">
              Runs {file === null ? `fixture ${fixtureId}` : file.name} through both parsers, one
              after the other, and shows where they agree. The AI side costs the same tokens as a
              normal run; the OpenResume side calls no model.{' '}
              <strong>
                OpenResume is dead code — nothing in the product imports it, and this lab is its
                first consumer
              </strong>
              , so treat its output as an untested baseline.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            The fixtures are the committed Live QA resume pool — synthetic samples, no real
            person&rsquo;s data. An upload is read once, in memory, for this run only.
          </p>
        </section>
      )}

      {running && (
        <p className="text-sm text-muted-foreground" role="status">
          Running {phase.what} through the shipped pipeline. The AI call is the slow part; there is
          no progress to show because the agent reports its timings when it finishes.
        </p>
      )}

      {error !== null && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-semibold">The run could not be requested</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {phase.state === 'done' && <Result result={phase.result} />}

      {phase.state === 'compared' && <Comparison result={phase.result} />}
    </div>
  );
}
