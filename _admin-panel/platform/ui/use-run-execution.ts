'use client';

import { useEffect, useRef, useState } from 'react';

import type { ActiveRunSnapshot, CancelResult, ExecutionStatus } from '../tests/execution-types';

/**
 * Starting, watching and cancelling one run (PLATFORM_TODO item 15).
 *
 * Shared by both run panels, because both do the same three things and the
 * server has one execution slot for them to share. The panels keep their own
 * copy and their own result view; this owns only the request state.
 *
 * **How progress arrives.** The start request stays open for the length of the
 * run and returns the structured result — Vitest's JSON reporter for a
 * category, Playwright's `report.json` for a pathway, exactly as items 12, 13
 * and 14 produce them. While it is open, this polls the status route once a
 * second for the server's own record of what is executing. Polling rather than
 * Server-Sent Events: the lifecycle changes a handful of times in a run, the
 * server has to hold that record anyway for the lock and the cancel, and a
 * dropped poll costs nothing — the next one has the current state.
 *
 * The timer is a chain of `setTimeout`s, not an interval, so a slow response
 * can never leave two polls in flight, and it stops on unmount.
 *
 * Nothing here invents a number. `elapsedMs` is measured on the server and the
 * lifecycle is whatever the server last observed; there is no percentage,
 * because neither runner knows one.
 */

const ACTIVE_ROUTE = '/api/admin/platform/tests/active';
const CANCEL_ROUTE = '/api/admin/platform/tests/cancel';

/** One second: slower than the lifecycle changes, and cheap on a local server. */
const POLL_MS = 1_000;

export type RunPhase<TResult> =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; result: TResult };

export type RunExecution<TResult> = {
  phase: RunPhase<TResult>;
  /** The server's record of the run in progress, or null when it has none. */
  active: ActiveRunSnapshot | null;
  /** Why the request could not be made. Not a test failure. */
  error: string | null;
  /** What the server said about a cancel request, in its own words. */
  cancelNotice: string | null;
  cancelling: boolean;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
};

export function useRunExecution<TResult>(options: {
  /** The start route. The panel owns it; this never builds one. */
  endpoint: string;
  /** The body to post: ids only, built by the panel. */
  buildBody: () => Record<string, string>;
}): RunExecution<TResult> {
  const [phase, setPhase] = useState<RunPhase<TResult>>({ state: 'idle' });
  const [active, setActive] = useState<ActiveRunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only refs are touched, so this needs no dependencies: a run that is still
  // being polled when the panel goes away stops being polled.
  useEffect(
    () => () => {
      pollingRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  const stopPolling = () => {
    pollingRef.current = false;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const poll = async (): Promise<void> => {
    if (!pollingRef.current) return;

    try {
      const response = await fetch(ACTIVE_ROUTE, { cache: 'no-store' });
      if (response.ok) {
        const body = (await response.json()) as ExecutionStatus;
        if (pollingRef.current) setActive(body.active);
      }
    } catch {
      // A dropped poll says nothing about the run. The next one has the
      // current state, and the result still comes back on the start request.
    }

    if (pollingRef.current) {
      timerRef.current = setTimeout(() => void poll(), POLL_MS);
    }
  };

  const start = async () => {
    setError(null);
    setCancelNotice(null);
    setActive(null);
    setPhase({ state: 'running' });

    pollingRef.current = true;
    void poll();

    try {
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.buildBody()),
      });
      const body = (await response.json().catch(() => null)) as TResult | { error?: string } | null;

      // 409 is the busy refusal, and its body is a run result like any other —
      // outcome `busy`, nothing ran. It is rendered, not thrown away.
      if ((response.ok || response.status === 409) && body !== null) {
        setPhase({ state: 'done', result: body as TResult });
        return;
      }

      const failure = (body as { error?: string } | null)?.error;
      setError(failure ?? `The run request failed with HTTP ${response.status}.`);
      setPhase({ state: 'idle' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The run request could not be sent.');
      setPhase({ state: 'idle' });
    } finally {
      stopPolling();
      setActive(null);
    }
  };

  const cancel = async () => {
    // The id comes from the server's own snapshot. The browser has no other
    // handle on a run, and nothing else is sent.
    const runId = active?.runId;
    if (runId === undefined) return;

    setCancelling(true);
    try {
      const response = await fetch(CANCEL_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const body = (await response.json().catch(() => null)) as
        | CancelResult
        | { error?: string }
        | null;

      if (!response.ok) {
        setCancelNotice(
          (body as { error?: string } | null)?.error ??
            `The cancel request failed with HTTP ${response.status}.`
        );
        return;
      }

      // The server's own sentence, whatever it says: cancelled, already
      // finished, not this run, or could not be stopped.
      setCancelNotice((body as CancelResult | null)?.detail ?? 'The cancel request was sent.');
    } catch (caught) {
      setCancelNotice(
        caught instanceof Error ? caught.message : 'The cancel request could not be sent.'
      );
    } finally {
      setCancelling(false);
    }
  };

  return { phase, active, error, cancelNotice, cancelling, start, cancel };
}
