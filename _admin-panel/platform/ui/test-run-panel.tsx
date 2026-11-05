'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { CategoryRunResult, RunnableCategory } from '../tests/run-types';
import { RunProgress } from './run-progress';
import { TestRunResult } from './test-run-result';
import { useRunExecution } from './use-run-execution';

/**
 * Running one category (PLATFORM_TODO item 12), handing the result to the
 * detail view (item 13), and watching or cancelling it while it runs (item 15).
 *
 * It posts a **category id** to `/api/admin/platform/tests/run` and renders
 * what comes back — it never sends a path, a flag or a command, and it never
 * spawns anything itself. Cancelling sends the opaque run id the server
 * reported, and nothing else.
 *
 * The control, the selection and the request state live here; `RunProgress`
 * owns the run in flight and `TestRunResult` owns the finished run, so the
 * three can grow apart. When the local-only gate is closed the control is
 * **not rendered at all**, which is item 12's done condition: a disabled button
 * would suggest the action exists and is merely unavailable to you.
 *
 * A second run is refused by the server, not by this component. The button is
 * disabled while this panel's own run is in flight, but that is a convenience —
 * the refusal comes back as a result with outcome `busy`, so a second tab or a
 * Live QA run already in progress is refused the same way.
 */

export function TestRunPanel({
  categories,
  canRun,
  gateReason,
}: {
  categories: RunnableCategory[];
  /** `canRunDeveloperSuites()`, evaluated on the server. */
  canRun: boolean;
  /** Why it is unavailable, shown when `canRun` is false. */
  gateReason: string;
}) {
  const runnable = categories.filter((category) => category.fileCount > 0);
  const [selected, setSelected] = useState(runnable[0]?.id ?? '');
  const { phase, active, error, cancelNotice, cancelling, start, cancel } =
    useRunExecution<CategoryRunResult>({
      endpoint: '/api/admin/platform/tests/run',
      // A category id and nothing else. The server derives the file list.
      buildBody: () => ({ categoryId: selected }),
    });

  if (!canRun) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-5">
        <h3 className="text-sm font-semibold">Running a category is unavailable here</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{gateReason}</p>
      </section>
    );
  }

  const running = phase.state === 'running';
  const selectedCategory = runnable.find((category) => category.id === selected);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Run one category</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Runs only the unit test files the coverage map lists under the chosen category, with
          Vitest&rsquo;s JSON reporter. Live QA pathways are Playwright specs and are not run here.
          One run happens at a time across the whole console. Results are not kept — reloading the
          page clears them.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Category
          </span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={running}
            className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
          >
            {runnable.map((category) => (
              <option key={category.id} value={category.id}>
                {category.id} ({category.fileCount} {category.fileCount === 1 ? 'file' : 'files'})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void start()}
          disabled={running || selected === ''}
          className={cn(
            'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {running ? 'Running…' : 'Run category'}
        </button>

        {selectedCategory && !running && (
          <span className="text-xs text-muted-foreground">
            {selectedCategory.fileCount} {selectedCategory.fileCount === 1 ? 'file' : 'files'} will
            be handed to Vitest
          </span>
        )}
      </div>

      {running && (
        <RunProgress
          active={active}
          cancelling={cancelling}
          cancelNotice={cancelNotice}
          onCancel={() => void cancel()}
        />
      )}

      {error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-semibold">The run could not be requested</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {phase.state === 'done' && <TestRunResult result={phase.result} />}
    </section>
  );
}
