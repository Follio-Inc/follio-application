'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type {
  ResumeLabRunResult,
  ResumeLabStage,
  ResumeLabView,
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
 */

const RUN_ROUTE = '/api/admin/platform/labs/resume-import-ai/run';

type Phase =
  | { state: 'idle' }
  | { state: 'running'; what: string }
  | { state: 'done'; result: ResumeLabRunResult };

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

      {tokens !== null && (
        <section className="rounded-lg border bg-background px-4 py-2">
          <p className="text-xs font-medium">
            Tokens: {tokens.total} ({tokens.input} in, {tokens.output} out)
          </p>
          <p className="text-[11px] text-muted-foreground">
            {tokens.note}
            {result.agentRunId !== null && (
              <>
                {' '}
                <code className="font-mono">{result.agentRunId}</code>
              </>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Cost and raw payloads are PLATFORM_TODO item 22.
          </p>
          {tokens.byStep.length > 0 && (
            <ul className="mt-1">
              {tokens.byStep.map((step) => (
                <li key={step.stepId} className="text-[11px] text-muted-foreground">
                  {step.stepId}: {step.input} in, {step.output} out
                  {step.model !== null && ` · ${step.model}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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
          <div className="grid grid-cols-3 gap-2 border-t p-3 sm:grid-cols-6">
            <Count label="Experience" value={String(parsed.counts.experiences)} />
            <Count label="Education" value={String(parsed.counts.educations)} />
            <Count label="Projects" value={String(parsed.counts.projects)} />
            <Count label="Skills" value={String(parsed.counts.skills)} />
            <Count label="Links" value={String(parsed.counts.links)} />
            <Count label="Certifications" value={String(parsed.counts.certifications)} />
          </div>
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
    </div>
  );
}

export function ResumeLab({ view }: { view: ResumeLabView }) {
  const [fixtureId, setFixtureId] = useState(view.fixtures[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const post = async (body: FormData, what: string) => {
    setError(null);
    setPhase({ state: 'running', what });
    try {
      const response = await fetch(RUN_ROUTE, { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as
        | ResumeLabRunResult
        | { error?: string }
        | null;

      // A refused run comes back as 409 with a full result; it is rendered,
      // because why it refused is the useful part.
      if (payload !== null && 'outcome' in payload) {
        setPhase({ state: 'done', result: payload });
        return;
      }
      setError(
        (payload as { error?: string } | null)?.error ??
          `The run request failed with HTTP ${response.status}.`
      );
      setPhase({ state: 'idle' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The run request could not be sent.');
      setPhase({ state: 'idle' });
    }
  };

  const runFixture = () => {
    const body = new FormData();
    body.set('fixtureId', fixtureId);
    void post(body, `fixture ${fixtureId}`);
  };

  const runUpload = () => {
    if (file === null) return;
    const body = new FormData();
    body.set('file', file);
    void post(body, file.name);
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
    </div>
  );
}
