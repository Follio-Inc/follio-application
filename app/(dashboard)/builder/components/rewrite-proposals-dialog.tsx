'use client';

/**
 * "Generate AI Improvements" — the rewrite review dialog.
 *
 * Three things happen here and they are deliberately kept apart:
 *
 *   1. **Generating** costs money and happens only when the user presses the
 *      button. Nothing runs on open, and nothing runs when a resume is
 *      selected. The idempotency key is minted at that press and reused for
 *      retries of that same attempt, so a timeout and a retry return the
 *      batch the first call already paid for.
 *   2. **Reviewing** is free. Previous batches are fetched from storage and
 *      opening one makes no model call at all.
 *   3. **Applying** is the only thing that writes to a resume, and it is a
 *      separate press from approving. The dialog never sends replacement
 *      text; the apply endpoint takes no body, and what gets written is the
 *      verified text the server already holds.
 *
 * The dialog does not decide whether something may be applied. It renders the
 * `applicable` flag the server computed, and the server re-checks everything
 * again when the button is pressed. A bug here can hide a usable suggestion;
 * it cannot produce an unsafe write.
 *
 * Stale-response protection is keyed on a request counter *and* the resume
 * id, because the Builder can switch resumes while a generation is in flight.
 * A response that arrives for a resume the user has left is dropped.
 */

import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  applyBlockedReason,
  buildGenerateRequest,
  canApply,
  canApprove,
  canReject,
  createIdempotencyKey,
  failureMessage,
  proposalLocation,
  proposalPaths,
  readApiFailure,
  recountBatch,
  replaceProposal,
  sortForReview,
  statusBadge,
  verificationSummary,
  type BatchView,
  type ProposalView,
  type RewriteMode,
} from '@/lib/resume-proposals/client';
import { MIN_JD_CHARS } from '@/lib/resume-lens/validate-jd';
import { ROLE_PROFILE_OPTIONS } from '@/lib/role-profiles/profiles';
import { cn } from '@/lib/utils';

import type { ApplyGate } from '../lib/apply-proposal-sync';

// ============================================================================
// PROPS
// ============================================================================

export interface RewriteProposalsDialogProps {
  /** The resume to work on, or null while the dialog is closed. */
  resume: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
  /**
   * Asked before every apply so the Builder can refuse while a save is in
   * flight or an unsaved edit would be overwritten. Defaults to allowing,
   * which is what a caller outside the Builder would want.
   */
  onBeforeApply?: (proposal: ProposalView) => ApplyGate;
  /**
   * Called `true` once an apply has passed the gate and `false` when it has
   * settled, whatever the outcome. Separate from `onApplied` on purpose: the
   * Builder holds a lock for the duration, and a lock released only on
   * success would stay on forever after one failed request.
   */
  onApplyingChange?: (applying: boolean) => void;
  /**
   * Called with the server's applied proposal so the Builder can fold the new
   * text into its draft. Runs only after the server confirmed the write.
   */
  onApplied?: (proposal: ProposalView) => void;
  /** Optional human location, so the Builder can name the role or project. */
  describeLocation?: (proposal: ProposalView) => string;
}

const MODE_TABS: Array<[RewriteMode, string]> = [
  ['general', 'General'],
  ['jd', 'Job description'],
  ['role', 'Target role'],
];

type Pane = 'generate' | 'review' | 'history';

// ============================================================================
// SMALL PIECES
// ============================================================================

const TONE_CLASS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  applied: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  rejected: 'bg-muted text-muted-foreground',
  blocked: 'bg-destructive/10 text-destructive',
};

function StatusChip({ proposal }: { proposal: ProposalView }) {
  const badge = statusBadge(proposal);
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASS[badge.tone] ?? TONE_CLASS.pending
      )}
    >
      {badge.label}
    </span>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/** One suggestion: where it goes, what changes, what checked it, what you can do. */
function ProposalCard({
  proposal,
  location,
  busy,
  onDecision,
  onApply,
  note,
}: {
  proposal: ProposalView;
  location: string;
  busy: boolean;
  onDecision: (proposal: ProposalView, decision: 'approve' | 'reject') => void;
  onApply: (proposal: ProposalView) => void;
  note: string | null;
}) {
  const verification = verificationSummary(proposal);
  const blocked = applyBlockedReason(proposal);

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{location}</p>
          <p className="text-xs text-muted-foreground">{proposal.targetRef}</p>
        </div>
        <StatusChip proposal={proposal} />
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your resume says
          </p>
          <p className="rounded-lg bg-muted px-3 py-2 text-foreground/80">
            {proposal.originalText}
          </p>
        </div>
        <div className="flex justify-center">
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggested
          </p>
          <p className="rounded-lg bg-primary/5 px-3 py-2 text-foreground">
            {proposal.proposedText}
          </p>
        </div>
      </div>

      {proposal.explanation && (
        <p className="mt-3 text-xs text-muted-foreground">{proposal.explanation}</p>
      )}

      {proposal.keywordsAddressed.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {proposal.keywordsAddressed.map((keyword) => (
            <Badge key={keyword} variant="secondary">
              {keyword}
            </Badge>
          ))}
        </div>
      )}

      {/* Verification is reported as its own fact, never as permission. */}
      <div className="mt-3 rounded-lg border border-dashed p-3">
        <p className="text-xs font-medium text-foreground">{verification.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{verification.detail}</p>
        {proposal.uncertainties.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {proposal.uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </div>

      {(proposal.stale || proposal.state === 'STALE') && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {proposal.staleDetail ??
              proposal.stateReason ??
              'Your resume changed after this suggestion was written.'}{' '}
            Your current text is kept — generate fresh suggestions to rewrite it.
          </span>
        </div>
      )}

      {note && <div className="mt-3">{<ErrorNote message={note} />}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canApprove(proposal) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onDecision(proposal, 'approve')}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Approve
          </Button>
        )}
        {canReject(proposal) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onDecision(proposal, 'reject')}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Reject
          </Button>
        )}
        {canApply(proposal) ? (
          <Button size="sm" disabled={busy} onClick={() => onApply(proposal)}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Apply to resume
          </Button>
        ) : (
          blocked && <span className="text-xs text-muted-foreground">{blocked}</span>
        )}
      </div>

      {canApprove(proposal) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Approving records your decision. Nothing changes on your resume until you press Apply.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// DIALOG
// ============================================================================

export function RewriteProposalsDialog({
  resume,
  onOpenChange,
  onBeforeApply,
  onApplyingChange,
  onApplied,
  describeLocation,
}: RewriteProposalsDialogProps) {
  const [pane, setPane] = useState<Pane>('generate');
  const [mode, setMode] = useState<RewriteMode>('general');
  const [jobDescription, setJobDescription] = useState('');
  const [targetRole, setTargetRole] = useState<string>(ROLE_PROFILE_OPTIONS[0]?.id ?? '');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [batch, setBatch] = useState<BatchView | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [history, setHistory] = useState<BatchView[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  /** Per-proposal in-flight guard, so one card's work disables only that card. */
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [proposalNotes, setProposalNotes] = useState<Record<string, string>>({});

  /**
   * Minted on a deliberate Generate press and reused for retries of that
   * attempt. Not regenerated on failure: the whole point is that a retry
   * after a timeout returns the batch the first call may already have stored.
   */
  const attemptKey = useRef<string | null>(null);

  /**
   * Only the newest request for the resume still on screen may write state.
   * Keyed on both because the Builder can switch resumes mid-flight, and a
   * response arriving for a resume the user has left must not populate the
   * dialog for the new one.
   */
  const requestSeq = useRef(0);
  const activeResumeId = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const resumeId = resume?.id ?? null;

  // Resume changed (or the dialog closed): drop everything. Proposals belong
  // to one resume and must never be shown against another.
  useEffect(() => {
    activeResumeId.current = resumeId;
    requestSeq.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    attemptKey.current = null;

    setPane('generate');
    setBatch(null);
    setProposals([]);
    setHistory(null);
    setError(null);
    setProposalNotes({});
    setBusyProposalId(null);
    setIsGenerating(false);
  }, [resumeId]);

  const adoptBatch = useCallback((next: { batch: BatchView; proposals: ProposalView[] }) => {
    setBatch(next.batch);
    setProposals(sortForReview(next.proposals));
    setPane('review');
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────

  const generate = useCallback(
    async (isRetry: boolean) => {
      if (!resumeId || isGenerating) return;

      // A new attempt gets a new key; a retry deliberately reuses the old one.
      if (!isRetry || !attemptKey.current) {
        attemptKey.current = createIdempotencyKey();
      }

      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      const forResume = resumeId;

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setIsGenerating(true);
      setError(null);

      try {
        const response = await fetch(proposalPaths.collection(forResume), {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildGenerateRequest({
              mode,
              jobDescription,
              targetRole,
              idempotencyKey: attemptKey.current,
            })
          ),
          signal: controller.signal,
        });

        const body: unknown = await response.json().catch(() => null);

        // Dropped if a newer request started or the user switched resumes.
        if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;

        if (!response.ok) {
          setError(failureMessage(readApiFailure(response.status, body)));
          return;
        }

        const payload = body as { batch?: BatchView; proposals?: ProposalView[] } | null;
        if (!payload?.batch || !Array.isArray(payload.proposals)) {
          setError('The suggestions came back empty. Nothing on your resume was changed.');
          return;
        }

        adoptBatch({ batch: payload.batch, proposals: payload.proposals });
        setHistory(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;
        setError('Could not reach the server. Your resume was not changed. Try again.');
      } finally {
        if (requestSeq.current === seq && activeResumeId.current === forResume) {
          setIsGenerating(false);
        }
      }
    },
    [resumeId, isGenerating, mode, jobDescription, targetRole, adoptBatch]
  );

  // ── History (no model call) ───────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    if (!resumeId) return;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    const forResume = resumeId;

    setIsLoadingHistory(true);
    setPane('history');
    setError(null);

    try {
      const response = await fetch(proposalPaths.collection(forResume), { cache: 'no-store' });
      const body: unknown = await response.json().catch(() => null);
      if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;

      if (!response.ok) {
        setError(failureMessage(readApiFailure(response.status, body)));
        return;
      }
      setHistory(((body as { batches?: BatchView[] })?.batches ?? []).slice());
    } catch {
      if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;
      setError('Could not load your previous suggestions.');
    } finally {
      if (requestSeq.current === seq && activeResumeId.current === forResume) {
        setIsLoadingHistory(false);
      }
    }
  }, [resumeId]);

  const openBatch = useCallback(
    async (batchId: string) => {
      if (!resumeId) return;
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      const forResume = resumeId;

      setError(null);
      try {
        const response = await fetch(proposalPaths.batch(forResume, batchId), {
          cache: 'no-store',
        });
        const body: unknown = await response.json().catch(() => null);
        if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;

        if (!response.ok) {
          setError(failureMessage(readApiFailure(response.status, body)));
          return;
        }
        const payload = body as { batch?: BatchView; proposals?: ProposalView[] } | null;
        if (payload?.batch && Array.isArray(payload.proposals)) {
          adoptBatch({ batch: payload.batch, proposals: payload.proposals });
        }
      } catch {
        if (requestSeq.current !== seq || activeResumeId.current !== forResume) return;
        setError('Could not open that set of suggestions.');
      }
    },
    [resumeId, adoptBatch]
  );

  // ── Decide ────────────────────────────────────────────────────────────────

  const noteFor = useCallback((proposalId: string, message: string | null) => {
    setProposalNotes((current) => {
      const next = { ...current };
      if (message) next[proposalId] = message;
      else delete next[proposalId];
      return next;
    });
  }, []);

  /** Pull one proposal's authoritative state back after a conflict. */
  const refreshProposal = useCallback(
    async (proposal: ProposalView) => {
      if (!resumeId) return;
      try {
        const response = await fetch(
          proposalPaths.proposal(resumeId, proposal.batchId, proposal.id),
          { cache: 'no-store' }
        );
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || activeResumeId.current !== resumeId) return;
        const fresh = (body as { proposal?: ProposalView } | null)?.proposal;
        if (fresh) {
          setProposals((current) => {
            const next = replaceProposal(current, fresh);
            setBatch((batchNow) => (batchNow ? recountBatch(batchNow, next) : batchNow));
            return next;
          });
        }
      } catch {
        // A failed refresh leaves the card as it was; the next action will
        // hit the same server check anyway.
      }
    },
    [resumeId]
  );

  const decide = useCallback(
    async (proposal: ProposalView, decision: 'approve' | 'reject') => {
      if (!resumeId || busyProposalId) return;
      setBusyProposalId(proposal.id);
      noteFor(proposal.id, null);

      try {
        const response = await fetch(
          proposalPaths.decision(resumeId, proposal.batchId, proposal.id),
          {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            // The only field this endpoint accepts.
            body: JSON.stringify({ decision }),
          }
        );
        const body: unknown = await response.json().catch(() => null);
        if (activeResumeId.current !== resumeId) return;

        if (!response.ok) {
          const failure = readApiFailure(response.status, body);
          noteFor(proposal.id, failureMessage(failure));
          if (failure.isConflict) await refreshProposal(proposal);
          return;
        }

        const updated = (body as { proposal?: ProposalView } | null)?.proposal;
        if (updated) {
          setProposals((current) => {
            const next = replaceProposal(current, updated);
            setBatch((batchNow) => (batchNow ? recountBatch(batchNow, next) : batchNow));
            return next;
          });
        }
      } catch {
        if (activeResumeId.current === resumeId) {
          noteFor(proposal.id, 'Could not save your decision. Nothing on your resume changed.');
        }
      } finally {
        setBusyProposalId(null);
      }
    },
    [resumeId, busyProposalId, noteFor, refreshProposal]
  );

  // ── Apply ─────────────────────────────────────────────────────────────────

  const apply = useCallback(
    async (proposal: ProposalView) => {
      if (!resumeId || busyProposalId) return;

      // The Builder gets to refuse first: a save in flight, an open inline
      // form, or an unsaved edit to this very field all mean applying now
      // would end with one of the two texts silently losing.
      const gate = onBeforeApply?.(proposal) ?? { ok: true as const };
      if (!gate.ok) {
        noteFor(proposal.id, gate.reason);
        return;
      }

      setBusyProposalId(proposal.id);
      noteFor(proposal.id, null);
      onApplyingChange?.(true);

      try {
        const response = await fetch(proposalPaths.apply(resumeId, proposal.batchId, proposal.id), {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          // Deliberately empty. The endpoint accepts no content, and what
          // gets written is the verified text the server already holds.
          body: JSON.stringify({}),
        });
        const body: unknown = await response.json().catch(() => null);
        if (activeResumeId.current !== resumeId) return;

        if (!response.ok) {
          const failure = readApiFailure(response.status, body);
          noteFor(proposal.id, failureMessage(failure));
          // A 409 means the server's view and this one differ. Re-read the
          // proposal rather than guessing which of them is right.
          if (failure.isConflict) await refreshProposal(proposal);
          return;
        }

        const applied = (body as { proposal?: ProposalView } | null)?.proposal;
        if (applied) {
          setProposals((current) => {
            const next = replaceProposal(current, applied);
            setBatch((batchNow) => (batchNow ? recountBatch(batchNow, next) : batchNow));
            return next;
          });
          onApplied?.(applied);
        }
      } catch {
        if (activeResumeId.current === resumeId) {
          noteFor(
            proposal.id,
            'Could not reach the server. Check your resume before trying again.'
          );
        }
      } finally {
        // Released whatever happened, including an abort or a thrown fetch:
        // a lock that outlives a failed request would disable Save for good.
        onApplyingChange?.(false);
        setBusyProposalId(null);
      }
    },
    [resumeId, busyProposalId, onBeforeApply, onApplyingChange, onApplied, noteFor, refreshProposal]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const jdTooShort = mode === 'jd' && jobDescription.trim().length < MIN_JD_CHARS;
  const canSubmit = !isGenerating && !jdTooShort && !(mode === 'role' && !targetRole);

  return (
    <Dialog open={Boolean(resume)} onOpenChange={onOpenChange}>
      {/*
        Three rules make this dialog scrollable, and all three are load-bearing:

          - `flex flex-col` with a `max-h` in viewport units gives the column a
            definite height to divide up. `dvh` rather than `vh` so a mobile
            browser's collapsing toolbar does not push the footer off-screen.
          - the body is `flex-1` **and `min-h-0`**. A flex item defaults to
            `min-height: auto`, which refuses to shrink below its content — so
            without `min-h-0` the body grows past the dialog and
            `overflow-y-auto` never engages. That was the original bug.
          - header and footer are `shrink-0`, so the body is the only thing
            that gives.

        `gap-0` overrides DialogContent's default `gap-4`; the borders do that
        job here. `pr-12` keeps the title clear of the absolutely positioned
        close button DialogContent renders at `right-4 top-4`.
      */}
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate AI Improvements
          </DialogTitle>
          <DialogDescription>
            {resume?.title ?? 'This resume'} — suggestions are reviewed by you before anything is
            written.
          </DialogDescription>
        </DialogHeader>

        {/*
          A plain scroll container rather than the shared `ScrollArea`.
          Radix's ScrollArea gives its viewport `h-full`, which resolves to
          `auto` when the root has only a `max-height` — so the viewport grows
          to its content and the root clips it with `overflow: hidden`. The
          result looks like a dialog that simply ends, with the Approve,
          Reject and Apply buttons below the cut and no way to reach them.
        */}
        <div
          data-testid="rewrite-proposals-scroll"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5"
        >
          {error && <ErrorNote message={error} />}

          {pane === 'generate' && (
            <div className="space-y-4">
              <Tabs value={mode} onValueChange={(value) => setMode(value as RewriteMode)}>
                <TabsList className="w-full">
                  {MODE_TABS.map(([value, label]) => (
                    <TabsTrigger key={value} value={value} className="flex-1">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {mode === 'jd' && (
                <div>
                  <Textarea
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    placeholder="Paste the job description here…"
                    rows={7}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {jobDescription.trim().length < MIN_JD_CHARS
                      ? `At least ${MIN_JD_CHARS} characters.`
                      : 'Keywords are only surfaced where your resume already supports them.'}
                  </p>
                </div>
              )}

              {mode === 'role' && (
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_PROFILE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => generate(false)} disabled={!canSubmit}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Writing suggestions…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate improvements
                    </>
                  )}
                </Button>
                <Button variant="ghost" onClick={loadHistory} disabled={isGenerating}>
                  <History className="mr-2 h-4 w-4" />
                  Previous suggestions
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                This reads your last saved resume and writes nothing. You review each suggestion and
                decide what to keep.
              </p>
            </div>
          )}

          {pane === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Previous suggestions</p>
                <Button size="sm" variant="ghost" onClick={() => setPane('generate')}>
                  Back
                </Button>
              </div>
              {isLoadingHistory && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </p>
              )}
              {!isLoadingHistory && history?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You have not generated any suggestions for this resume yet.
                </p>
              )}
              {history?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openBatch(item.id)}
                  className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{item.mode} rewrite</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.counts.total} suggestion{item.counts.total === 1 ? '' : 's'} ·{' '}
                    {item.counts.pendingReview} to review · {item.counts.approved} approved ·{' '}
                    {item.counts.applied} applied · {item.counts.rejected} rejected ·{' '}
                    {item.counts.unavailable} unavailable · {item.counts.stale} out of date
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Status: {item.status}</p>
                </button>
              ))}
            </div>
          )}

          {pane === 'review' && batch && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {batch.counts.total} suggestion{batch.counts.total === 1 ? '' : 's'}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={loadHistory}>
                      <History className="mr-1.5 h-3.5 w-3.5" />
                      History
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPane('generate')}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      New
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {batch.counts.pendingReview} to review · {batch.counts.approved} approved ·{' '}
                  {batch.counts.applied} applied · {batch.counts.rejected} rejected ·{' '}
                  {batch.counts.unavailable} unavailable · {batch.counts.stale} out of date
                </p>
                {batch.summary && (
                  <p className="mt-2 text-xs text-muted-foreground">{batch.summary}</p>
                )}
              </div>

              {batch.openQuestions.length > 0 && (
                <div className="rounded-lg border border-dashed p-3">
                  <p className="text-xs font-medium">Questions only you can answer</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {batch.openQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              )}

              {batch.limitations.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {batch.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              )}

              {proposals.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  This run produced no suggestions that passed the checks. Your resume is unchanged.
                </p>
              )}

              {proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  location={describeLocation?.(proposal) ?? proposalLocation(proposal)}
                  busy={busyProposalId === proposal.id}
                  note={proposalNotes[proposal.id] ?? null}
                  onDecision={decide}
                  onApply={apply}
                />
              ))}
            </div>
          )}
        </div>

        {/*
          Batch-level actions live here so they never scroll away. The
          per-proposal Approve / Reject / Apply buttons cannot: there is one
          set per card, so they are reached by scrolling — which is the thing
          the body above now actually does.
        */}
        <div
          data-testid="rewrite-proposals-footer"
          className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-6 py-3"
        >
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {pane === 'review' && batch
              ? `${batch.counts.pendingReview} to review · ${batch.counts.approved} approved · ${batch.counts.applied} applied`
              : 'Nothing is written to your resume until you apply a suggestion.'}
          </p>
          <div className="flex shrink-0 gap-2">
            {pane !== 'history' && (
              <Button size="sm" variant="ghost" onClick={loadHistory} disabled={isGenerating}>
                <History className="mr-1.5 h-3.5 w-3.5" />
                History
              </Button>
            )}
            {pane !== 'generate' && (
              <Button size="sm" variant="ghost" onClick={() => setPane('generate')}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                New
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
