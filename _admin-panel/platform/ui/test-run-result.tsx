import { cn } from '@/lib/utils';

import type {
  CategoryRunResult,
  TestCaseResult,
  TestFailure,
  TestFileResult,
} from '../tests/run-types';

/**
 * A finished run, laid out for inspection (PLATFORM_TODO item 13).
 *
 * Presentational only: it renders the `CategoryRunResult` item 12 produces and
 * imports nothing but its **types**, so it carries no server code into the
 * client bundle the run panel ships.
 *
 * Run summary → test file → test case → failure detail, which is the order a
 * person reads a failure in. Stacks are behind a `<details>` because a handful
 * of failures would otherwise bury the summary; the assertion itself is always
 * visible, since that is the line that says what went wrong.
 *
 * What is **not** here, because Vitest's JSON reporter does not provide it: a
 * structured expected/actual pair, a diff, and anything about a test's inputs
 * or fixtures. Expected against actual lives inside the assertion text, and
 * that text is shown verbatim rather than taken apart — see `run-types.ts`.
 *
 * Item 15's two outcomes get their own block. A run someone cancelled and a
 * start that was refused because something else is running are neither test
 * failures nor broken runners, so they borrow neither one's words.
 */

/** Which of Vitest's statuses this is, for colour only. */
type StatusTone = 'passed' | 'failed' | 'skipped' | 'other';

function toneFor(status: string): StatusTone {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'skipped' || status === 'pending' || status === 'todo') return 'skipped';
  // An unfamiliar status is shown as it came rather than mapped onto a guess.
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

function Count({ label, value, tone }: { label: string; value: number; tone?: StatusTone }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-base font-semibold tabular-nums',
          tone === 'failed' && value > 0 && 'text-red-600 dark:text-red-400',
          tone === 'passed' && value > 0 && 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FailureDetail({
  failure,
  index,
  total,
}: {
  failure: TestFailure;
  index: number;
  total: number;
}) {
  return (
    <div className="mt-2 rounded border border-red-500/20 bg-red-500/5 p-2">
      {total > 1 && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Error {index + 1} of {total}
        </p>
      )}

      {/* The assertion is always visible: it is the line that names expected
          against actual, in Vitest's own words. */}
      <p className="whitespace-pre-wrap break-words font-mono text-xs text-red-700 dark:text-red-400">
        {failure.message}
      </p>

      {failure.location && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">at {failure.location}</p>
      )}

      {failure.stack && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            Stack trace
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {failure.stack}
          </pre>
        </details>
      )}
    </div>
  );
}

function CaseRow({ test }: { test: TestCaseResult }) {
  return (
    <li className="border-t px-4 py-2 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <StatusPill status={test.status} />
        {test.suite.length > 0 && (
          <span className="text-xs text-muted-foreground">{test.suite.join(' › ')} ›</span>
        )}
        <span className="text-sm">{test.name}</span>
        {test.durationMs !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">{test.durationMs} ms</span>
        )}
      </div>

      {test.failures.map((failure, index) => (
        <FailureDetail
          key={`${failure.message}:${failure.location ?? index}`}
          failure={failure}
          index={index}
          total={test.failures.length}
        />
      ))}
    </li>
  );
}

function FileBlock({ file }: { file: TestFileResult }) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <StatusPill status={file.status} />
          <code className="font-mono text-xs text-foreground">{file.path}</code>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {file.tests.length} {file.tests.length === 1 ? 'case' : 'cases'}
          {file.durationMs !== null && ` · ${file.durationMs} ms`}
        </span>
      </header>

      {file.message && (
        <div className="mx-4 mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            File-level error
          </p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
            {file.message}
          </pre>
        </div>
      )}

      {file.tests.length === 0 ? (
        <p className="border-t px-4 py-2 text-sm text-muted-foreground">
          The report lists this file with no test cases.
        </p>
      ) : (
        <ul className="border-t">
          {file.tests.map((test) => (
            <CaseRow key={`${test.suite.join('›')}›${test.name}`} test={test} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The header every outcome gets, run or not. */
function RunHeader({ result }: { result: CategoryRunResult }) {
  const tone: StatusTone = result.outcome === 'passed' ? 'passed' : result.ran ? 'failed' : 'other';

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
        <span className="text-sm font-semibold">{result.categoryId}</span>
        <StatusPill status={result.outcome} />
        {!result.ran && (
          <span className="text-xs text-muted-foreground">
            nothing ran — this is not a test failure
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>
    </div>
  );
}

/** A run that was stopped on request, or one that was never started. */
function StoppedRun({ result }: { result: CategoryRunResult }) {
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
          <span className="text-sm text-muted-foreground">{result.categoryId}</span>
          <StatusPill status={result.outcome} />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{result.detail}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {cancelled
            ? `Stopped after ${result.durationMs} ms. No test failed and nothing timed out: the run was stopped before its report was read.`
            : 'Nothing was started and nothing was queued. Run it again when the other run has finished.'}
        </p>
      </div>

      {result.filesNotReported.length > 0 && (
        <section className="rounded-lg border border-dashed bg-card p-4">
          <h4 className="text-sm font-semibold">
            {cancelled ? 'Not reported' : 'Would have run'} ({result.filesNotReported.length})
          </h4>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.filesNotReported.map((file) => (
              <li key={file}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{file}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function TestRunResult({ result }: { result: CategoryRunResult }) {
  // Said first, because the generic "nothing ran" copy below would read as a
  // fault: a cancellation is a decision, and a refusal never started.
  if (result.outcome === 'cancelled' || result.outcome === 'busy') {
    return <StoppedRun result={result} />;
  }

  // Only a run that produced a report has test detail to show. Everything else
  // is an infrastructure state and says so instead of rendering an empty suite.
  if (!result.ran) {
    return (
      <div className="space-y-3">
        <RunHeader result={result} />

        <section className="rounded-lg border border-dashed bg-card p-4">
          <h4 className="text-sm font-semibold">No results to show</h4>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Vitest produced no report, so there is nothing to inspect. This is a problem with the
            run itself, not a verdict on the tests.
          </p>
          {result.exitCode !== null && (
            <p className="mt-1 text-xs text-muted-foreground">Exit code {result.exitCode}.</p>
          )}
          {result.filesNotReported.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Would have run ({result.filesNotReported.length})
              </p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {result.filesNotReported.map((file) => (
                  <li key={file}>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{file}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {result.runnerOutput && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Runner output
            </p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
              {result.runnerOutput}
            </pre>
          </div>
        )}
      </div>
    );
  }

  const { totals } = result;

  return (
    <div className="space-y-3">
      <RunHeader result={result} />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Count label="Files requested" value={result.filesRequested.length} />
        <Count label="Files reported" value={result.filesReported.length} />
        <Count label="Tests" value={totals?.tests ?? 0} />
        <Count label="Passed" value={totals?.passed ?? 0} tone="passed" />
        <Count label="Failed" value={totals?.failed ?? 0} tone="failed" />
        <Count label="Skipped" value={totals?.pending ?? 0} />
        <Count label="Duration (ms)" value={result.durationMs} />
      </div>

      {totals && totals.todo > 0 && (
        <p className="text-xs text-muted-foreground">
          {totals.todo} {totals.todo === 1 ? 'test is' : 'tests are'} marked todo.
        </p>
      )}

      {result.filesNotReported.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <h4 className="text-sm font-semibold">
            Requested but not in the report ({result.filesNotReported.length})
          </h4>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Vitest did not report on these files, so nothing is known about them. They have not
            passed.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {result.filesNotReported.map((file) => (
              <li key={file}>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{file}</code>
              </li>
            ))}
          </ul>
        </section>
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

      {result.files.map((file) => (
        <FileBlock key={file.path} file={file} />
      ))}

      <p className="text-xs text-muted-foreground">
        Expected and actual appear inside each assertion line, which is where Vitest&rsquo;s JSON
        reporter puts them; it provides no separate diff. Nothing here is kept — reloading clears
        it.
      </p>
    </div>
  );
}
