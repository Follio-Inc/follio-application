'use client';

import { useCallback, useEffect, useState } from 'react';

import { requestJobRequirements } from '@/lib/resume-edit/client';
import { isScorableJob } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements/types';

export type JobRequirementsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; requirements: JobRequirement[] }
  | { status: 'error'; message: string };

export interface JobRequirementsRead {
  state: JobRequirementsState;
  retry: () => void;
}

const CACHE_LIMIT = 12;
// Requirements depend only on the posting, so the composer and the open request share one read.
const cache = new Map<string, JobRequirement[]>();

function remember(key: string, requirements: JobRequirement[]) {
  cache.delete(key);
  cache.set(key, requirements);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function keyFor(jobDescription: string | null): string | null {
  const job = jobDescription?.trim() ?? '';
  return isScorableJob(job) ? job : null;
}

/**
 * The posting's requirements, read once per posting. `debounceMs` waits for
 * typing to settle, so a posting typed by hand is not read on every key.
 */
export function useJobRequirements(
  jobDescription: string | null,
  { debounceMs = 0 }: { debounceMs?: number } = {}
): JobRequirementsRead {
  const key = keyFor(jobDescription);
  const [result, setResult] = useState<{ key: string; state: JobRequirementsState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || cache.has(key)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setResult({ key, state: { status: 'loading' } });
      requestJobRequirements(key, controller.signal)
        .then(({ requirements }) => {
          remember(key, requirements);
          setResult({ key, state: { status: 'ready', requirements } });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setResult({
            key,
            state: {
              status: 'error',
              message:
                error instanceof Error ? error.message : 'Could not read the posting. Try again.',
            },
          });
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, debounceMs, key]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  let state: JobRequirementsState = { status: 'idle' };
  const cached = key ? cache.get(key) : undefined;
  if (cached) state = { status: 'ready', requirements: cached };
  else if (key) state = result?.key === key ? result.state : { status: 'loading' };
  return { state, retry };
}

export function readyRequirements(read: JobRequirementsRead): JobRequirement[] | null {
  return read.state.status === 'ready' ? read.state.requirements : null;
}
