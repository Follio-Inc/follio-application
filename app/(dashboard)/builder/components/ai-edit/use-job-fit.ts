'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { requestJobFit } from '@/lib/resume-edit/client';
import type { ExpertRead } from '@/services/ai/judge/types';

export type JobFitState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; read: ExpertRead; text: string }
  | { status: 'error'; message: string };

export interface JobFit {
  state: JobFitState;
  /** The read before the latest one, so a re-check can show what moved. */
  previous: ExpertRead | null;
  /** The resume changed since the read was made. */
  stale: boolean;
  check: () => void;
}

const CACHE_LIMIT = 12;
// A read is a paid model call. Reopening a request with the same resume and posting reuses it.
const cache = new Map<string, ExpertRead>();

function cacheKey(jobDescription: string, text: string): string {
  return `${jobDescription}\u0000${text}`;
}

function remember(key: string, read: ExpertRead) {
  cache.delete(key);
  cache.set(key, read);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * A recruiter's read of the resume against the request's posting. Runs once
 * on its own when a tailored request opens; after that only when asked, since
 * each read is a model call.
 */
export function useJobFit(jobDescription: string | null, resumeText: string): JobFit {
  const [state, setState] = useState<JobFitState>(() => {
    const cached = jobDescription ? cache.get(cacheKey(jobDescription, resumeText)) : undefined;
    return cached ? { status: 'ready', read: cached, text: resumeText } : { status: 'idle' };
  });
  const [previous, setPrevious] = useState<ExpertRead | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const check = useCallback(() => {
    if (!jobDescription) return;
    abortRef.current?.abort();
    if (state.status === 'ready' && state.text !== resumeText) setPrevious(state.read);
    const key = cacheKey(jobDescription, resumeText);
    const cached = cache.get(key);
    if (cached) {
      setState({ status: 'ready', read: cached, text: resumeText });
      return;
    }

    setState({ status: 'loading' });
    const controller = new AbortController();
    abortRef.current = controller;
    requestJobFit({ resumeText, jobDescription }, controller.signal)
      .then(({ read }) => {
        remember(key, read);
        setState({ status: 'ready', read, text: resumeText });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'The recruiter read failed. Try again.',
        });
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
  }, [jobDescription, resumeText, state]);

  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!jobDescription || startedFor.current === jobDescription) return;
    startedFor.current = jobDescription;
    if (state.status === 'idle') check();
  }, [check, jobDescription, state.status]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stale = state.status === 'ready' && state.text !== resumeText;
  return { state, previous, stale, check };
}
