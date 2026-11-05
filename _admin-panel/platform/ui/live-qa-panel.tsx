'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

import type { PathwayRunResult, RunnablePathway } from '../tests/live-qa-types';
import { LiveQaRunResult } from './live-qa-result';
import { RunProgress } from './run-progress';
import { useRunExecution } from './use-run-execution';

/**
 * Running one Live QA pathway (PLATFORM_TODO item 14).
 *
 * Posts a **pathway id** to `/api/admin/platform/tests/live-qa/run` and renders
 * what comes back. It never sends a spec path, a Playwright flag or a config
 * location — the server takes those from the existing catalog and runner.
 *
 * When the local-only gate is closed the control is not rendered at all, the
 * same rule the Vitest runner follows. A pathway that needs a stored browser
 * session is still listed, with its prerequisite shown, and running it returns
 * "skipped — auth not configured" rather than failing: no session is invented
 * here or anywhere else.
 *
 * One pathway per run. Item 15 added the run in flight: the lifecycle the
 * server reports while Playwright works, and a cancel that stops it and its
 * browsers. That slot is shared with the Vitest runner, so starting a pathway
 * while a category is running comes back refused as `busy` — from the server,
 * not from a disabled button here.
 */

export function LiveQaPanel({
  pathways,
  canRun,
  gateReason,
  authConfigured,
  baseUrl,
}: {
  pathways: RunnablePathway[];
  /** `canRunDeveloperSuites()`, evaluated on the server. */
  canRun: boolean;
  /** Why running is unavailable, shown when `canRun` is false. */
  gateReason: string;
  /** Whether `LIVE_QA_STORAGE_STATE` points at a saved session. */
  authConfigured: boolean;
  /** The base URL a run would target, from the existing Live QA defaults. */
  baseUrl: string;
}) {
  const [selected, setSelected] = useState(pathways[0]?.id ?? '');
  const { phase, active, error, cancelNotice, cancelling, start, cancel } =
    useRunExecution<PathwayRunResult>({
      endpoint: '/api/admin/platform/tests/live-qa/run',
      // A pathway id and nothing else.
      buildBody: () => ({ pathwayId: selected }),
    });

  if (!canRun) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-5">
        <h3 className="text-sm font-semibold">Running a Live QA pathway is unavailable here</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{gateReason}</p>
      </section>
    );
  }

  const running = phase.state === 'running';
  const current = pathways.find((pathway) => pathway.id === selected);

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold">Run one Live QA pathway</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Drives a real browser through one journey with the existing Playwright pathways, then
          reads the run&rsquo;s{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">report.json</code>. It targets{' '}
          {baseUrl}, so that instance has to be running. One run happens at a time across the whole
          console. Results are not kept — reloading clears them.
        </p>
        {!authConfigured && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            No saved browser session is configured, so the pathways that sign in first will report
            as skipped rather than run. <code className="font-mono">npm run live-qa:auth</code>
            creates one.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pathway
          </span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={running}
            className="h-9 max-w-md rounded-md border bg-background px-2 text-sm disabled:opacity-60"
          >
            {pathways.map((pathway) => (
              <option key={pathway.id} value={pathway.id}>
                {pathway.id} — {pathway.title}
                {pathway.runnable ? '' : ' (needs auth)'}
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
          {running ? 'Running…' : 'Run pathway'}
        </button>

        {current && !running && (
          <span className="text-xs text-muted-foreground">
            {current.area} · {current.stability}
            {current.requiresAuth && ' · signs in first'}
            {current.fixtureKind !== 'none' && ` · fixture: ${current.fixtureKind}`}
          </span>
        )}
      </div>

      {current && !current.runnable && !running && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-semibold">This pathway cannot run yet</p>
          <p className="mt-1 text-sm text-muted-foreground">{current.blockedReason}</p>
        </div>
      )}

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

      {phase.state === 'done' && <LiveQaRunResult result={phase.result} />}
    </section>
  );
}
