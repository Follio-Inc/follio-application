import { cn } from '@/lib/utils';

import type { PathwayArtifact, PathwayCaseResult, PathwayRunResult } from '../tests/live-qa-types';

/**
 * A finished Live QA run, read from `report.json` (PLATFORM_TODO item 14).
 *
 * Presentational only: it renders the result and imports nothing but its
 * **types**. Every field comes from Playwright's own JSON report — statuses,
 * durations, retries, errors and attachments — and nothing from the list
 * reporter's console output.
 *
 * Artifact links go through the contained admin artifact route rather than a
 * filesystem path, and only appear when the report actually carried a file.
 *
 * Item 15's two outcomes get their own block. A pathway someone cancelled and a
 * start that was refused because something else is running are neither pathway
 * failures nor broken runners, so they borrow neither one's words. Whatever
 * Playwright had already written to disk when it was stopped is still there —
 * nothing here deletes an artifact.
 */

const ARTIFACT_ROUTE = '/api/admin/platform/tests/live-qa/artifact';

/** Playwright test statuses, mapped to colour only. */
function toneFor(status: string): 'passed' | 'failed' | 'skipped' | 'other' {
  if (status === 'expected' || status === 'passed') return 'passed';
  if (status === 'unexpected' || status === 'failed' || status === 'timedOut') return 'failed';
  if (status === 'skipped' || status === 'flaky') return status === 'flaky' ? 'other' : 'skipped';
  return 'other';
}

function StatusPill({ status }: { status: string }) {
  const tone = toneFor(status);

  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'passed' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'failed' && 'bg-red-500/10 text-red-700 dark:text-red-400',
        tone === 'skipped' && 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
        tone === 'other' && 'bg-muted text-muted-foreground'
      )}
    >
      {status}
    </span>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ArtifactLink({ artifact }: { artifact: PathwayArtifact }) {
  // No file in the report, or a file outside the artifacts directory: named,
  // not linked. The route would refuse it anyway.
  if (!artifact.path) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {artifact.name} (no file)
      </span>
    );
  }

  return (
    <a
      href={`${ARTIFACT_ROUTE}?path=${encodeURIComponent(artifact.path)}`}
      target="_blank"
      rel="noreferrer"
      className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
    >
      {artifact.name}
    </a>
  );
}

function CaseRow({ test }: { test: PathwayCaseResult }) {
  return (
    <li className="border-t px-4 py-2 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <StatusPill status={test.status} />
        {test.attemptStatus && test.attemptStatus !== test.status && (
          <span className="text-[11px] text-muted-foreground">attempt: {test.attemptStatus}</span>
        )}
        {test.suite.length > 0 && (
          <span className="text-xs text-muted-foreground">{test.suite.join(' › ')} ›</span>
        )}
        <span className="text-sm">{test.name}</span>
        {test.durationMs !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">{test.durationMs} ms</span>
        )}
        {test.retries > 0 && (
          <span className="text-xs text-muted-foreground">
            after {test.retries} {test.retries === 1 ? 'retry' : 'retries'}
          </span>
        )}
      </div>

      {test.error && (
        <div className="mt-2 rounded border border-red-500/20 bg-red-500/5 p-2">
          <p className="whitespace-pre-wrap break-words font-mono text-xs text-red-700 dark:text-red-400">
            {test.error}
          </p>
          {test.location && (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">at {test.location}</p>
          )}
          {test.stack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
                Error detail
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {test.stack}
              </pre>
            </details>
          )}
        </div>
      )}

      {test.artifacts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Artifacts
          </span>
          {test.artifacts.map((artifact, index) => (
            <ArtifactLink key={`${artifact.name}:${artifact.path ?? index}`} artifact={artifact} />
          ))}
        </div>
      )}
    </li>
  );
}

function RunHeader({ result }: { result: PathwayRunResult }) {
  const tone = result.outcome === 'passed' ? 'passed' : result.ran ? 'failed' : 'other';

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3',
        tone === 'passed' && 'border-emerald-500/30 bg-emerald-500/5',
        tone === 'failed' && 'border-red-500/30 bg-red-500/5',
        tone === 'other' && 'border-amber-500/30 bg-amber-500/5'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-semibold">{result.pathwayId}</code>
        {result.pathwayTitle && (
          <span className="text-sm text-muted-foreground">{result.pathwayTitle}</span>
        )}
        <StatusPill status={result.outcome} />
        {!result.ran && result.outcome !== 'skipped-auth-not-configured' && (
          <span className="text-xs text-muted-foreground">
            nothing ran — this is not a pathway failure
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {result.baseUrl && <>against {result.baseUrl} · </>}
        {result.durationMs} ms
        {result.exitCode !== null && <> · exit {result.exitCode}</>}
        {result.startedAt && <> · started {result.startedAt}</>}
      </p>
    </div>
  );
}

/** A pathway run that was stopped on request, or one that was never started. */
function StoppedRun({ result }: { result: PathwayRunResult }) {
  const cancelled = result.outcome === 'cancelled';

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-lg border px-4 py-3',
          cancelled ? 'bg-muted/40' : 'border-amber-500/30 bg-amber-500/5'
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">
            {cancelled ? 'Cancelled' : 'Refused — a run is already in progress'}
          </h4>
          <code className="font-mono text-sm">{result.pathwayId}</code>
          <StatusPill status={result.outcome} />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{result.detail}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {cancelled
            ? 'No assertion failed and nothing timed out — the browser was stopped part way through, so there is no verdict on this pathway.'
            : 'Nothing was started and nothing was queued. Run it again when the other run has finished.'}
        </p>
        {cancelled && result.artifactsDir && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">{result.artifactsDir}</p>
        )}
      </div>
    </div>
  );
}

export function LiveQaRunResult({ result }: { result: PathwayRunResult }) {
  // Said first, because the generic "nothing ran" copy below would read as a
  // fault: a cancellation is a decision, and a refusal never started.
  if (result.outcome === 'cancelled' || result.outcome === 'busy') {
    return <StoppedRun result={result} />;
  }

  if (!result.ran) {
    const isSkip = result.outcome === 'skipped-auth-not-configured';

    return (
      <div className="space-y-3">
        <RunHeader result={result} />

        <section className="rounded-lg border border-dashed bg-card p-4">
          <h4 className="text-sm font-semibold">
            {isSkip ? 'Prerequisite not met' : 'No results to show'}
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {isSkip
              ? 'Nothing was run, and nothing failed. The pathway signs in before it starts, so it needs a saved browser session.'
              : 'Playwright produced no result for this pathway, so there is nothing to inspect. This is a problem with the run, not a verdict on the product.'}
          </p>
          {result.artifactsDir && (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              {result.artifactsDir}
            </p>
          )}
        </section>

        {result.reportErrors.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Reported errors
            </p>
            <ul className="mt-1 space-y-1">
              {result.reportErrors.map((message) => (
                <li
                  key={message}
                  className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground"
                >
                  {message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.runnerOutput && (
          <details>
            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
              Runner output
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
              {result.runnerOutput}
            </pre>
          </details>
        )}
      </div>
    );
  }

  const { totals } = result;

  return (
    <div className="space-y-3">
      <RunHeader result={result} />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Count label="Tests" value={result.cases.length} />
        <Count label="Expected" value={totals?.expected ?? 0} />
        <Count label="Unexpected" value={totals?.unexpected ?? 0} />
        <Count label="Flaky" value={totals?.flaky ?? 0} />
        <Count label="Skipped" value={totals?.skipped ?? 0} />
      </div>

      <section className="rounded-lg border bg-card">
        <header className="px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {result.cases.length} {result.cases.length === 1 ? 'test' : 'tests'} from report.json
            {result.artifactsDir && (
              <>
                {' '}
                · <code className="font-mono">{result.artifactsDir}</code>
              </>
            )}
          </p>
        </header>
        <ul className="border-t">
          {result.cases.map((test) => (
            <CaseRow key={`${test.suite.join('›')}›${test.name}`} test={test} />
          ))}
        </ul>
      </section>

      {result.reportErrors.length > 0 && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Reported errors
          </p>
          <ul className="mt-1 space-y-1">
            {result.reportErrors.map((message) => (
              <li
                key={message}
                className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground"
              >
                {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.runnerOutput && (
        <details>
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Runner output
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
            {result.runnerOutput}
          </pre>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Read from the run&rsquo;s <code className="font-mono">report.json</code>, which the existing
        Live QA Playwright config writes. Screenshots and traces are retained only for failures.
        Nothing here is kept in the console — reloading clears it, though the artifacts stay on
        disk.
      </p>
    </div>
  );
}
