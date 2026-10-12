import { cn } from '@/lib/utils';

import type {
  HistoryView,
  RunSummary,
  TargetHistory,
  TestFailingState,
  TestTrend,
  TestTrendPoint,
} from '../tests/history-types';

/**
 * Local run history, last pass and flaky evidence (PLATFORM_TODO item 16).
 *
 * A server component that renders a prop. It imports the history store's
 * **types** only, so the module that reads `_admin-panel/platform/.runs/`
 * cannot follow it into a browser bundle; the route reads the store and passes
 * the view down.
 *
 * Everything shown is a stored value: a run's own timestamps and duration, the
 * reporter's totals, the verdict each test had in each run, and the commit the
 * run happened at. Nothing is averaged, rated or projected, and there is no
 * chart — a trend here is the sequence of verdicts itself.
 *
 * A target that has never run says so. A test that has never passed says so.
 * Neither borrows a time from somewhere else.
 */

/** Tests listed per target. A long list is capped, and the cap is stated. */
const TESTS_SHOWN_PER_TARGET = 300;

const STATE_LABELS: Record<TestFailingState, string> = {
  passing: 'passing',
  'newly-failing': 'newly failing',
  'already-failing': 'already failing',
  'first-failure': 'failing on its first recorded run',
  skipped: 'skipped',
  unknown: 'no verdict recorded',
};

function Count({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-base font-semibold tabular-nums',
          tone === 'bad' && value > 0 && 'text-red-600 dark:text-red-400',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-500'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: string }) {
  const tone =
    outcome === 'passed'
      ? 'passed'
      : outcome === 'failed'
        ? 'failed'
        : outcome === 'cancelled'
          ? 'muted'
          : 'other';

  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone === 'passed' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        tone === 'failed' && 'bg-red-500/10 text-red-700 dark:text-red-400',
        tone === 'other' && 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
        tone === 'muted' && 'bg-muted text-muted-foreground'
      )}
    >
      {outcome}
    </span>
  );
}

/** One verdict in a trend: the mark, and the run behind it in its title. */
function TrendMark({ point }: { point: TestTrendPoint }) {
  const mark =
    point.status === 'passed'
      ? '✓'
      : point.status === 'failed'
        ? '✕'
        : point.status === 'skipped'
          ? '–'
          : '?';

  return (
    <span
      title={`${point.status} · ${point.at}${
        point.commit === null
          ? ''
          : ` · ${point.commit.slice(0, 8)}${point.dirty ? ' (dirty)' : ''}`
      }`}
      className={cn(
        'font-mono text-xs',
        point.status === 'passed' && 'text-emerald-600 dark:text-emerald-400',
        point.status === 'failed' && 'text-red-600 dark:text-red-400',
        point.status !== 'passed' && point.status !== 'failed' && 'text-muted-foreground'
      )}
    >
      {mark}
    </span>
  );
}

function Trend({ trend }: { trend: TestTrend }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label="recent verdicts, oldest first">
      {trend.recent.map((point, index) => (
        <TrendMark key={`${point.at}:${index}`} point={point} />
      ))}
    </span>
  );
}

/** The one label item 16 defines: a pass and a failure at the same commit. */
function FlakyBadge({ trend }: { trend: TestTrend }) {
  if (trend.flaky === null) return null;

  return (
    <span
      title={`${trend.flaky.passes} passed and ${trend.flaky.failures} failed at commit ${trend.flaky.commit}${
        trend.flaky.dirty ? ', with uncommitted changes in the tree' : ''
      }`}
      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-500"
    >
      flaky · {trend.flaky.commit.slice(0, 8)}
    </span>
  );
}

function TestRow({ trend }: { trend: TestTrend }) {
  return (
    <li className="border-t px-4 py-2 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <Trend trend={trend} />
        <span
          className={cn(
            'text-[10px] font-semibold uppercase tracking-wide',
            trend.state === 'newly-failing' && 'text-red-600 dark:text-red-400',
            trend.state === 'already-failing' && 'text-amber-600 dark:text-amber-500',
            trend.state !== 'newly-failing' &&
              trend.state !== 'already-failing' &&
              'text-muted-foreground'
          )}
        >
          {STATE_LABELS[trend.state]}
        </span>
        <FlakyBadge trend={trend} />
        {trend.reporterFlakyAt !== null && (
          <span
            title={`Playwright retried this case and it passed, most recently at ${trend.reporterFlakyAt}`}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            reporter: retried
          </span>
        )}
      </div>

      <p className="mt-0.5 text-sm">
        {trend.suite.length > 0 && (
          <span className="text-muted-foreground">{trend.suite.join(' › ')} › </span>
        )}
        {trend.name}
      </p>

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {trend.file !== null && <code className="font-mono">{trend.file}</code>}
        {trend.file !== null && ' · '}
        {trend.lastPassedAt === null ? 'No recorded pass yet' : `Last passed ${trend.lastPassedAt}`}
      </p>
    </li>
  );
}

function RunRow({ run, showTarget }: { run: RunSummary; showTarget?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 border-t px-4 py-2 first:border-t-0">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {run.startedAt}
      </span>
      <OutcomePill outcome={run.outcome} />
      {showTarget && (
        <>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {run.runner}
          </span>
          <code className="font-mono text-xs">{run.targetId}</code>
        </>
      )}
      <span className="text-xs tabular-nums text-muted-foreground">{run.durationMs} ms</span>
      {run.ran ? (
        <span className="text-xs text-muted-foreground">
          {run.summary.passed} passed · {run.summary.failed} failed · {run.summary.skipped} skipped
          {run.summary.files !== null && ` · ${run.summary.files} files`}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">no report — nothing to count</span>
      )}
      <span className="font-mono text-[11px] text-muted-foreground">
        {run.commit.sha === null ? 'commit unknown' : run.commit.sha.slice(0, 8)}
        {run.commit.dirty && ' +dirty'}
      </span>
    </li>
  );
}

function TargetSection({ target }: { target: TargetHistory }) {
  if (target.runsRecorded === 0) {
    return (
      <li className="flex flex-wrap items-baseline gap-2 border-t px-4 py-2 first:border-t-0">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {target.runner}
        </span>
        <code className="font-mono text-xs">{target.targetId}</code>
        <span className="text-xs text-muted-foreground">
          Never run here — no history, and nothing to show in its place
        </span>
      </li>
    );
  }

  const shown = target.tests.slice(0, TESTS_SHOWN_PER_TARGET);

  return (
    <li className="border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {target.runner}
        </span>
        <code className="font-mono text-sm font-semibold">{target.targetId}</code>
        {target.lastRun !== null && <OutcomePill outcome={target.lastRun.outcome} />}
        <span className="text-xs text-muted-foreground">Last run {target.lastRun?.startedAt}</span>
        <span className="text-xs text-muted-foreground">
          ·{' '}
          {target.lastPassAt === null ? 'No recorded pass yet' : `Last passed ${target.lastPassAt}`}
        </span>
        <span className="text-xs text-muted-foreground">
          · {target.runsRecorded} {target.runsRecorded === 1 ? 'run' : 'runs'} recorded
        </span>
      </div>

      {target.tests.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            {target.tests.length} {target.tests.length === 1 ? 'test' : 'tests'} with recorded
            history
          </summary>
          <ul className="mt-1 rounded-lg border bg-background">
            {shown.map((trend) => (
              <TestRow key={trend.id} trend={trend} />
            ))}
          </ul>
          {target.tests.length > shown.length && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Showing {shown.length} of {target.tests.length}. Flaky and failing tests sort first,
              so nothing notable is behind this cut.
            </p>
          )}
        </details>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Recent runs
        </summary>
        <ul className="mt-1 rounded-lg border bg-background">
          {target.recent.map((run) => (
            <RunRow key={run.runId} run={run} />
          ))}
        </ul>
      </details>
    </li>
  );
}

export function TestHistory({ view }: { view: HistoryView }) {
  const { counts } = view;
  const notable = view.targets
    .flatMap((target) =>
      target.tests
        .filter((trend) => trend.flaky !== null || trend.state === 'newly-failing')
        .map((trend) => ({ target, trend }))
    )
    .slice(0, 50);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">History</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The last {view.retainedPerTarget} runs of each category and pathway, kept as JSON under{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{view.root}</code> — local, and not
          in git. Each test&rsquo;s trend is its own recorded verdicts, oldest first. A test is
          called <strong>flaky</strong> only when it both passed and failed at the same commit. Read
          when this page loaded ({view.readAt}); reload after a run to see it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Count label="Targets with history" value={counts.targetsWithHistory} />
        <Count label="Runs recorded" value={counts.runsRecorded} />
        <Count label="Tests with history" value={counts.testsWithHistory} />
        <Count label="Flaky" value={counts.flaky} tone="warn" />
        <Count label="Newly failing" value={counts.newlyFailing} tone="bad" />
        <Count label="Already failing" value={counts.alreadyFailing} tone="warn" />
      </div>

      {counts.runsRecorded === 0 ? (
        <section className="rounded-lg border border-dashed bg-background p-4">
          <h4 className="text-sm font-semibold">Nothing has been run here yet</h4>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            History begins with the first run from this console. Until then there is no trend, no
            last pass and no flaky evidence — and none is invented in the meantime.
          </p>
        </section>
      ) : (
        <>
          {notable.length > 0 && (
            <section className="rounded-lg border border-amber-500/30 bg-amber-500/5">
              <header className="px-4 py-2">
                <h4 className="text-sm font-semibold">Flaky or newly failing ({notable.length})</h4>
                <p className="text-xs text-muted-foreground">
                  Newly failing means it passed in the run before this one. Already failing is kept
                  apart, below, because it is not a new regression.
                </p>
              </header>
              <ul className="border-t">
                {notable.map(({ target, trend }) => (
                  <li key={`${target.runner}:${target.targetId}:${trend.id}`}>
                    <div className="px-4 pt-2 text-[11px] text-muted-foreground">
                      {target.runner} · {target.targetId}
                    </div>
                    <ul>
                      <TestRow trend={trend} />
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border bg-background">
            <header className="px-4 py-2">
              <h4 className="text-sm font-semibold">Recent runs ({view.recentRuns.length})</h4>
              <p className="text-xs text-muted-foreground">
                Newest first, across every target. A cancelled run or one that wrote no report is
                kept as a run and holds no test results, so it can never become evidence about a
                test.
              </p>
            </header>
            <ul className="border-t">
              {view.recentRuns.map((run) => (
                <RunRow key={run.runId} run={run} showTarget />
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="rounded-lg border bg-background">
        <header className="px-4 py-2">
          <h4 className="text-sm font-semibold">Every target ({view.targets.length})</h4>
          <p className="text-xs text-muted-foreground">
            Targets with history first, most recent run first. One that has never run is listed
            saying exactly that.
          </p>
        </header>
        <ul className="border-t">
          {view.targets.map((target) => (
            <TargetSection key={`${target.runner}:${target.targetId}`} target={target} />
          ))}
        </ul>
      </section>
    </section>
  );
}
