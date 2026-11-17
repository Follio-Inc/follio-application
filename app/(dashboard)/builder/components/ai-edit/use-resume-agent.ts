'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ResumeAgentRequestError,
  runResumeAgentRequest,
  type ResumeAgentAnalysis,
  type ResumeAgentMode,
} from '@/lib/resume-agent/client';
import { listResumeEdits } from '@/lib/resume-edit/client';
import { RESUME_EDIT_LIMITS, type ResumeEditSessionView } from '@/lib/resume-edit/types';

import { useBuilderStore } from '../builder-store-provider';

/**
 * What became of a propose run's suggestion set.
 *
 * `none` is a real, successful outcome: grounding dropped every rewrite, so
 * the server saved nothing. `unopened` means the set exists but this screen
 * could not fetch it — the proposal is not lost, only not on screen.
 */
export type ProposalOutcome =
  | { kind: 'none'; message: string | null }
  | { kind: 'opening'; sessionId: string }
  | { kind: 'opened'; sessionId: string }
  | { kind: 'unopened'; sessionId: string; reason: string };

export type ResumeAgentState =
  | { status: 'idle' }
  | { status: 'running'; mode: ResumeAgentMode }
  | {
      status: 'succeeded';
      mode: ResumeAgentMode;
      analysis: ResumeAgentAnalysis;
      /** Null in analyze mode, which can never propose. */
      proposal: ProposalOutcome | null;
    }
  | { status: 'failed'; mode: ResumeAgentMode; message: string; httpStatus: number | null };

export interface ResumeAgentRun {
  state: ResumeAgentState;
  /** The analysis of the resume open right now, or null. */
  analysis: ResumeAgentAnalysis | null;
  proposal: ProposalOutcome | null;
  /** The session the last propose run saved, whether or not it opened. */
  proposedSessionId: string | null;
  /** Safe to show. Null unless the last run failed. */
  error: string | null;
  /** A proposal whose fate this screen cannot vouch for. Not an error. */
  warning: string | null;
  running: boolean;
  runningMode: ResumeAgentMode | null;
  analyze: (jobDescription: string, instruction?: string) => void;
  propose: (jobDescription: string, instruction?: string) => void;
  cancel: () => void;
}

export interface UseResumeAgentOptions {
  /**
   * A grounded suggestion set was saved and fetched. Hand it to the existing
   * review UI. The hook never applies anything itself.
   */
  onProposalSaved?: (view: ResumeEditSessionView) => void;
}

/**
 * Why an agent action cannot run yet, or null when it can.
 *
 * The same bounds the route validates, checked here so a request that is
 * certain to be refused is never sent. Pure, so the copy can be tested
 * without rendering anything.
 */
export function analyzeBlockedReason(jobDescription: string): string | null {
  const text = jobDescription.trim();
  if (text.length === 0) {
    return 'Paste the job description first.';
  }
  if (text.length < RESUME_EDIT_LIMITS.jobMinChars) {
    return `Add a bit more of the posting — at least ${RESUME_EDIT_LIMITS.jobMinChars} characters.`;
  }
  if (text.length > RESUME_EDIT_LIMITS.jobMaxChars) {
    return 'That posting is too long. Paste the job description, not the whole page.';
  }
  return null;
}

/**
 * Whether either agent action may be pressed right now. A run already in
 * flight blocks both, so one click cannot spend two runs — and an analyze
 * cannot race a propose.
 */
export function canAnalyze(jobDescription: string, running: boolean): boolean {
  return !running && analyzeBlockedReason(jobDescription) === null;
}

/** Statuses the route returns before `runResumeAgent` is ever called. */
const PRE_RUN_REFUSALS = new Set([400, 401, 404, 429, 503]);

/**
 * Whether a propose run that did not finish cleanly may still have saved a
 * suggestion set on the server.
 *
 * Aborting a fetch stops this browser listening; it does not stop the server.
 * A cancelled or timed-out propose is genuinely unknown, and saying "nothing
 * happened" would be a guess that leaves the user with an orphan set they
 * were never told about. Only a refusal that happened before the agent ran
 * is safe to call a no-op.
 */
export function proposalMayExist(
  mode: ResumeAgentMode,
  httpStatus: number | null | 'cancelled'
): boolean {
  if (mode !== 'propose') return false;
  if (httpStatus === 'cancelled') return true;
  // A network failure may still have delivered the request.
  if (httpStatus === null) return true;
  return !PRE_RUN_REFUSALS.has(httpStatus);
}

const UNKNOWN_PROPOSAL_WARNING =
  'A suggestion set may already have been saved before this stopped. ' +
  'Check Recent requests below before asking for another.';

/**
 * Pick the session a propose run reported, out of the recent list.
 *
 * Matches the id exactly — never "the newest", which would hand the user
 * someone else's request after a race — and re-checks that the set belongs
 * to the resume that asked for it.
 */
export function findProposedSession(
  sessions: readonly ResumeEditSessionView[],
  sessionId: string,
  resumeId: string
): ResumeEditSessionView | null {
  const match = sessions.find((session) => session.id === sessionId);
  if (!match) return null;
  if (match.profileId !== resumeId) return null;
  return match;
}

/** What to show the user for a failed run, and the status behind it. */
export function describeFailure(error: unknown): { message: string; httpStatus: number | null } {
  if (error instanceof ResumeAgentRequestError) {
    return { message: error.message, httpStatus: error.status };
  }
  // Covers ResumeAgentNetworkError, which already carries readable copy.
  if (error instanceof Error && error.message.trim()) {
    return { message: error.message, httpStatus: null };
  }
  return {
    message: 'The analysis could not be completed. Try again in a moment.',
    httpStatus: null,
  };
}

const LOOKUP_FAILED =
  'It was saved, but could not be opened automatically. Find it under Recent requests below.';
const LOOKUP_ERRORED =
  'It was saved, but the list of recent requests could not be loaded. Reopen this panel to find it.';

/**
 * Run the Resume Agent over the resume open in the builder.
 *
 * `analyze` reads and scores. `propose` additionally asks the agent to save a
 * grounded suggestion set, which is then handed to the existing review UI for
 * the user to approve. Neither mode applies anything: this hook has no path
 * to apply or revert, and propose mode is reachable only from an explicit
 * click.
 *
 * One run at a time across both modes, aborted on unmount. A failure is
 * reported once and never retried on its own: a 429 would still be over the
 * limit and a 504 still too slow, and a repeated propose risks a second
 * suggestion set the user did not ask for.
 */
export function useResumeAgent(options: UseResumeAgentOptions = {}): ResumeAgentRun {
  const resumeId = useBuilderStore((s) => s.draftProfile.id);
  const [state, setState] = useState<ResumeAgentState>({ status: 'idle' });
  const [warning, setWarning] = useState<string | null>(null);
  const [ranFor, setRanFor] = useState(resumeId);
  const abortRef = useRef<AbortController | null>(null);

  // Read inside the promise callbacks to tell whether the resume moved on
  // while the request was in the air.
  const resumeRef = useRef(resumeId);
  resumeRef.current = resumeId;

  // Held in a ref so an inline callback from the panel does not re-create the
  // request functions on every render.
  const onProposalSavedRef = useRef(options.onProposalSaved);
  onProposalSavedRef.current = options.onProposalSaved;

  // An analysis describes one resume, and a suggestion set belongs to one
  // resume. Switching drops both rather than leaving a stale read beside a
  // different document. Same render-phase reset the review provider uses.
  if (ranFor !== resumeId) {
    setRanFor(resumeId);
    const wasProposing = state.status === 'running' && state.mode === 'propose';
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle' });
    // The server may well have finished that propose. Say so rather than
    // silently dropping it.
    setWarning(wasProposing ? UNKNOWN_PROPOSAL_WARNING : null);
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((current) => {
      if (current.status !== 'running') return current;
      if (proposalMayExist(current.mode, 'cancelled')) setWarning(UNKNOWN_PROPOSAL_WARNING);
      return { status: 'idle' };
    });
  }, []);

  const run = useCallback((mode: ResumeAgentMode, jobDescription: string, instruction?: string) => {
    // A run already in flight, in either mode. Starting a second would bill
    // the user twice and race the first to the screen.
    if (abortRef.current) return;
    if (analyzeBlockedReason(jobDescription)) return;

    const target = resumeRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'running', mode });
    setWarning(null);

    /** True while this run is still the one the screen is showing. */
    const current = () => !controller.signal.aborted && resumeRef.current === target;

    runResumeAgentRequest(target, { jobDescription, instruction, mode }, controller.signal)
      .then(async (response) => {
        if (!current()) return;

        const sessionId = response.analysis.proposedSessionId;
        if (mode !== 'propose' || !sessionId) {
          setState({
            status: 'succeeded',
            mode,
            analysis: response.analysis,
            // Grounding dropped everything, so nothing was saved. A real
            // outcome, not a failure.
            proposal:
              mode === 'propose'
                ? { kind: 'none', message: response.analysis.proposalMessage }
                : null,
          });
          return;
        }

        setState({
          status: 'succeeded',
          mode,
          analysis: response.analysis,
          proposal: { kind: 'opening', sessionId },
        });

        // The agent returns a compact display shape, not a session view, so
        // the review UI needs the real record. Fetched through the existing
        // list endpoint; a failure here is a lookup problem, never a failed
        // proposal, and never a reason to run the agent again.
        let view: ResumeEditSessionView | null = null;
        let reason = LOOKUP_FAILED;
        try {
          const { sessions } = await listResumeEdits();
          view = findProposedSession(sessions, sessionId, target);
        } catch {
          reason = LOOKUP_ERRORED;
        }

        if (!current()) return;
        if (!view) {
          setState((previous) =>
            previous.status === 'succeeded'
              ? { ...previous, proposal: { kind: 'unopened', sessionId, reason } }
              : previous
          );
          return;
        }

        setState((previous) =>
          previous.status === 'succeeded'
            ? { ...previous, proposal: { kind: 'opened', sessionId } }
            : previous
        );
        onProposalSavedRef.current?.(view);
      })
      .catch((error: unknown) => {
        if (!current()) return;
        const failure = describeFailure(error);
        setState({ status: 'failed', mode, ...failure });
        if (proposalMayExist(mode, failure.httpStatus)) setWarning(UNKNOWN_PROPOSAL_WARNING);
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
  }, []);

  const analyze = useCallback(
    (jobDescription: string, instruction?: string) => run('analyze', jobDescription, instruction),
    [run]
  );

  // Only ever called from the explicit "Suggest improvements" control.
  const propose = useCallback(
    (jobDescription: string, instruction?: string) => run('propose', jobDescription, instruction),
    [run]
  );

  const proposal = state.status === 'succeeded' ? state.proposal : null;

  return {
    state,
    analysis: state.status === 'succeeded' ? state.analysis : null,
    proposal,
    proposedSessionId: proposal && proposal.kind !== 'none' ? proposal.sessionId : null,
    error: state.status === 'failed' ? state.message : null,
    warning,
    running: state.status === 'running',
    runningMode: state.status === 'running' ? state.mode : null,
    analyze,
    propose,
    cancel,
  };
}
