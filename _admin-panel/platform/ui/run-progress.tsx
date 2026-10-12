'use client';

import { cn } from '@/lib/utils';

import type { ActiveRunSnapshot, RunLifecycle } from '../tests/execution-types';

/**
 * The run in progress, while it is in progress (PLATFORM_TODO item 15).
 *
 * Shared by both run panels. Everything it shows is something the server
 * observed: which runner holds the slot, which target it was given, the stage
 * it last reached, when each earlier stage was reached, and how long it has
 * been going. Those timings are measured.
 *
 * There is **no bar and no percentage**. A percentage needs a denominator, and
 * neither runner has one mid-run: Vitest's JSON reporter and Playwright's
 * `report.json` are each written once, at the end — which is what makes them
 * trustworthy as results. A bar filling at a guessed rate would be the only
 * invented thing in this console, so the stages are listed instead.
 *
 * Cancel sends the opaque run id the snapshot carries, and the server checks it
 * against the run it owns before stopping anything.
 */

const LIFECYCLE_LABELS: Record<RunLifecycle, string> = {
  accepted: 'Accepted — holding the run slot',
  starting: 'Starting the runner',
  running: 'Running',
  'reading-report': 'Reading the report',
  completed: 'Execution finished',
  failed: 'Execution failed',
  cancelled: 'Cancelled',
};

const RUNNER_LABELS: Record<ActiveRunSnapshot['runner'], string> = {
  vitest: 'Vitest',
  'live-qa': 'Live QA (Playwright)',
};

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RunProgress({
  active,
  cancelling,
  cancelNotice,
  onCancel,
}: {
  /** The server's snapshot, or null when it has not reported one yet. */
  active: ActiveRunSnapshot | null;
  cancelling: boolean;
  /** Whatever the server said about a cancel request. */
  cancelNotice: string | null;
  onCancel: () => void;
}) {
  if (active === null) {
    return (
      <div className="rounded-lg border bg-background px-4 py-3" role="status">
        <p className="text-sm text-muted-foreground">
          The request is in flight and the server reports nothing running yet. Either it is still
          being accepted, or it has just finished and the result is on its way.
        </p>
        {cancelNotice && <p className="mt-1 text-sm text-muted-foreground">{cancelNotice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background px-4 py-3" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {RUNNER_LABELS[active.runner]}
        </span>
        <code className="font-mono text-sm font-semibold">{active.targetId}</code>
        <span className="text-sm text-muted-foreground">
          {LIFECYCLE_LABELS[active.lifecycle]} · {seconds(active.elapsedMs)}
        </span>

        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling || !active.cancellable}
          className={cn(
            'ml-auto h-8 rounded-md border px-3 text-xs font-medium transition-colors',
            'hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {cancelling ? 'Cancelling…' : active.cancelRequested ? 'Cancel requested' : 'Cancel'}
        </button>
      </div>

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {active.steps.map((step, index) => (
          <li key={`${step.state}:${step.atMs}:${index}`} className="flex items-center gap-2">
            {index > 0 && <span className="text-muted-foreground">→</span>}
            <span className="text-xs text-muted-foreground">
              {step.state}
              <span className="ml-1 tabular-nums">{seconds(step.atMs)}</span>
            </span>
          </li>
        ))}
      </ol>

      {cancelNotice && <p className="text-sm text-muted-foreground">{cancelNotice}</p>}

      <p className="text-xs text-muted-foreground">
        Stages and times are measured on the server, polled once a second. There is no percentage to
        show: the runner writes its report when it finishes, so nothing knows how far through it is.
      </p>
    </div>
  );
}
