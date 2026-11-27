'use client';

import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  History,
  Loader2,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { notifyProfileUpdated } from '@/lib/events';
import { requestResumeEdits } from '@/lib/resume-edit/client';
import {
  describeBrief,
  groupChanges,
  keepAllLabel,
  plural,
  textFor,
} from '@/lib/resume-edit/review';
import type { ResumeEditBrief, ResumeEditSessionView } from '@/lib/resume-edit/types';
import { hasContactDraftChanges } from '@/lib/stores/builder-store';
import { cn } from '@/lib/utils';

import { saveProfileDraft } from '../../lib/save-profile-draft';
import { useBuilderStore } from '../builder-store-provider';
import { AiEditChangeCard } from './ai-edit-change-card';
import { AiEditComposer, type ComposerExperience } from './ai-edit-composer';
import { useAiEditReview } from './ai-edit-review';
import { SessionScoreBoard } from './ai-edit-scores';
import {
  useJobKeywords,
  useSessionScores,
  type SessionScores as SessionScoresValue,
} from './use-edit-scores';
import { useJobFit } from './use-job-fit';
import {
  readyRequirements,
  useJobRequirements,
  type JobRequirementsRead,
} from './use-job-requirements';

interface AiEditPanelProps {
  onClose: () => void;
}

const SLOW_AFTER_SECONDS = 25;

export function AiEditPanel({ onClose }: AiEditPanelProps) {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const contactDraft = useBuilderStore((s) => s.contactDraft);
  const savedContact = useBuilderStore((s) => s.savedContact);
  const markSaved = useBuilderStore((s) => s.markSaved);
  const discardChanges = useBuilderStore((s) => s.discardChanges);
  const setSaving = useBuilderStore((s) => s.setSaving);
  const isSaving = useBuilderStore((s) => s.isSaving);
  const {
    session,
    recent,
    texts,
    skipped,
    review,
    pending,
    busy,
    unsaved,
    locked,
    error,
    notice,
    announcement,
    openSession,
    closeSession,
    rememberSession,
    setText,
    setSkip,
    keep,
    undo,
    setError,
  } = useAiEditReview();

  const jobDescription = session?.brief.jobDescription ?? null;
  const jobRequirements = useJobRequirements(jobDescription);
  const requirements = readyRequirements(jobRequirements);
  const scores = useSessionScores(requirements);
  const jobKeywords = useJobKeywords(jobDescription, requirements);

  const [composerBrief, setComposerBrief] = useState<ResumeEditBrief | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [loadingBrief, setLoadingBrief] = useState<ResumeEditBrief | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const experiences: ComposerExperience[] = useMemo(
    () =>
      draftProfile.workExperiences
        .filter((item) => item.isVisible !== false)
        .map((item) => ({
          id: item.id,
          label: [item.role, item.company].filter(Boolean).join(' · ') || 'Untitled role',
        })),
    [draftProfile.workExperiences]
  );

  const showComposer = useCallback(
    (brief: ResumeEditBrief | null) => {
      closeSession();
      setComposerBrief(brief);
      setComposerKey((key) => key + 1);
    },
    [closeSession]
  );

  const submit = useCallback(
    async (brief: ResumeEditBrief) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setComposerBrief(brief);
      setLoadingBrief(brief);
      setError(null);
      try {
        const { session: created } = await requestResumeEdits(brief, controller.signal);
        openSession(created);
        rememberSession(created);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setComposerKey((key) => key + 1);
        setError(caught instanceof Error ? caught.message : 'Suggestions failed. Try again.');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoadingBrief(null);
        }
      }
    },
    [openSession, rememberSession, setError]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingBrief(null);
    setComposerKey((key) => key + 1);
  }, []);

  const saveEditorChanges = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveProfileDraft({
        draftProfile,
        contactDraft,
        shouldSaveProfile: unsaved,
        shouldSaveContact: hasContactDraftChanges(contactDraft, savedContact),
      });
      markSaved();
      notifyProfileUpdated();
    } catch {
      setError('Could not save your edits. Try again.');
    } finally {
      setSaving(false);
    }
  }, [contactDraft, draftProfile, markSaved, savedContact, setError, setSaving, unsaved]);

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {error && (
        <Banner tone="error" role="alert">
          {error}
        </Banner>
      )}

      {unsaved && (
        <Banner tone="warning" role="status">
          <span className="flex-1">
            You have unsaved edits in the editor. Save them before keeping AI changes.
          </span>
          <span className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={discardChanges}
              disabled={isSaving}
              className="h-7"
            >
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEditorChanges}
              disabled={isSaving}
              className="h-7"
            >
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Save edits
            </Button>
          </span>
        </Banner>
      )}

      {loadingBrief ? (
        <LoadingView brief={loadingBrief} onCancel={cancel} />
      ) : !session || !review ? (
        <>
          <Intro />
          <AiEditComposer
            key={composerKey}
            experiences={experiences}
            initialBrief={composerBrief}
            onSubmit={submit}
          />
          {recent.length > 0 && <RecentList sessions={recent} onOpen={openSession} />}
        </>
      ) : (
        <section aria-labelledby="ai-edit-results" className="space-y-6">
          <div className="sticky top-12 z-10 -mx-6 space-y-3 border-b border-border/60 bg-background/95 px-6 pb-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => showComposer(session.brief)}
              disabled={busy}
              className="-ml-2 h-7 px-2 text-muted-foreground"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Change request
            </Button>
            <div className="min-w-0">
              <h2 id="ai-edit-results" className="text-section-title truncate">
                {describeBrief(session.brief)}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {review.total === 0
                  ? 'No suggestions'
                  : [
                      `${review.total - review.open} of ${review.total} reviewed`,
                      review.applied > 0 ? `${review.applied} kept` : null,
                      review.needsInput > 0 ? `${review.needsInput} need a number` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </p>
            </div>
            {review.total > 0 && (
              <ProgressBar done={review.total - review.open} total={review.total} />
            )}
            {(review.readyIds.length > 1 || review.applied > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                {review.readyIds.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => keep(review.readyIds)}
                    disabled={locked}
                  >
                    {pending?.kind === 'keep' && pending.id === null ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <CircleCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    )}
                    {keepAllLabel(review)}
                  </Button>
                )}
                {review.applied > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => undo(null)}
                    disabled={busy}
                  >
                    {pending?.kind === 'undo' && pending.id === null ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    )}
                    Undo all kept
                  </Button>
                )}
              </div>
            )}
          </div>

          {notice && <Banner tone="warning">{notice}</Banner>}

          {(session.droppedCount > 0 || session.failedSections.length > 0) && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {session.droppedCount > 0 && (
                <p className="flex items-start gap-1.5">
                  <ShieldCheck
                    className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600"
                    aria-hidden
                  />
                  <span>
                    Removed {plural(session.droppedCount, 'suggestion')} that mentioned things your
                    resume does not show.
                  </span>
                </p>
              )}
              {session.failedSections.length > 0 && (
                <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                  <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>
                    Could not finish: {session.failedSections.join(', ')}. Send the request again to
                    retry.
                  </span>
                </p>
              )}
            </div>
          )}

          {scores && (
            <SessionScores
              key={session.id}
              scores={scores}
              jobDescription={jobDescription}
              resumeText={scores.now.text}
              requirements={jobRequirements}
            />
          )}

          {review.total > 0 && review.open === 0 && (
            <DoneCard
              applied={review.applied}
              skipped={review.skipped}
              onNew={() => showComposer(null)}
              onClose={onClose}
            />
          )}

          {review.total === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-10 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-5 w-5 text-emerald-600" aria-hidden />
              </span>
              <p className="text-sm font-medium">Your resume already covers this well.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different goal or a narrower part of the resume.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => showComposer(session.brief)}
              >
                Change request
              </Button>
            </div>
          ) : (
            groupChanges(session.changes).map(([label, changes]) => {
              const left = changes.filter(
                (change) => change.status === 'proposed' && !skipped.has(change.id)
              ).length;
              return (
                <div key={label} className="space-y-2.5">
                  <h3 className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-foreground">{label}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {left > 0 ? `${left} to review` : 'Done'}
                    </span>
                  </h3>
                  <ul className="space-y-2.5">
                    {changes.map((change) => (
                      <AiEditChangeCard
                        key={change.id}
                        change={change}
                        text={textFor(change, texts)}
                        skipped={skipped.has(change.id)}
                        jobKeywords={jobKeywords}
                        pending={pending?.id === change.id}
                        locked={change.status === 'applied' ? busy : locked}
                        onTextChange={(text) => setText(change.id, text)}
                        onKeep={() => keep([change.id])}
                        onSkip={() => setSkip(change.id, true)}
                        onRestore={() => setSkip(change.id, false)}
                        onUndo={() => undo([change.id])}
                      />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

/** Keyed by session, so a new request starts a fresh recruiter read. */
function SessionScores({
  scores,
  jobDescription,
  resumeText,
  requirements,
}: {
  scores: SessionScoresValue;
  jobDescription: string | null;
  resumeText: string;
  requirements: JobRequirementsRead;
}) {
  const jobFit = useJobFit(jobDescription, resumeText);
  return (
    <SessionScoreBoard
      scores={scores}
      jobFit={jobDescription ? jobFit : null}
      requirements={requirements}
    />
  );
}

function Intro() {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm"
        aria-hidden
      >
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Improve your resume with AI</h2>
        <p className="text-sm text-muted-foreground">
          Choose what to improve. Suggestions show up right in your resume, and you keep only the
          ones you like.
        </p>
      </div>
    </div>
  );
}

function Banner({
  tone,
  role,
  children,
}: {
  tone: 'error' | 'warning';
  role?: 'alert' | 'status';
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 text-sm',
        tone === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-amber-500/30 bg-amber-500/5 text-foreground'
      )}
    >
      <CircleAlert
        className={cn(
          'h-4 w-4 shrink-0',
          tone === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
        )}
        aria-hidden
      />
      {children}
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Suggestions reviewed"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          percent === 100 ? 'bg-emerald-500' : 'bg-primary'
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

const LOADING_STEPS = [
  { label: 'Reading your resume', startsAt: 0 },
  { label: 'Drafting suggestions', startsAt: 4 },
  { label: 'Checking every claim against your resume', startsAt: 12 },
] as const;

function LoadingView({ brief, onCancel }: { brief: ResumeEditBrief; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const slow = elapsed >= SLOW_AFTER_SECONDS;

  return (
    <div className="space-y-5" aria-busy>
      <div className="surface-raised space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <Sparkles className="h-4 w-4 animate-pulse" />
            </span>
            <div className="min-w-0">
              <p className="text-section-title">Working on your suggestions</p>
              <p className="truncate text-xs text-muted-foreground">{describeBrief(brief)}</p>
            </div>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <ol className="space-y-2.5">
          {LOADING_STEPS.map((step, index) => {
            const next = LOADING_STEPS[index + 1];
            const done = next !== undefined && elapsed >= next.startsAt;
            const active = !done && elapsed >= step.startsAt;
            return (
              <li
                key={step.label}
                className={cn(
                  'flex items-center gap-2.5 text-sm transition-colors',
                  done || active ? 'text-foreground' : 'text-muted-foreground/60'
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                  {done ? (
                    <CircleCheck className="h-4 w-4 text-emerald-600" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                {step.label}
              </li>
            );
          })}
        </ol>

        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {slow
            ? 'Still working. Longer resumes take a little more time.'
            : 'This usually takes 10 to 20 seconds.'}
        </p>
      </div>

      {[0, 1].map((item) => (
        <div key={item} className="space-y-3 rounded-xl border border-border/60 p-4" aria-hidden>
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="space-y-2 border-l-2 border-border pl-3">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2 border-l-2 border-primary/30 pl-3">
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentList({
  sessions,
  onOpen,
}: {
  sessions: ResumeEditSessionView[];
  onOpen: (session: ResumeEditSessionView) => void;
}) {
  return (
    <section aria-labelledby="ai-edit-recent" className="space-y-2.5 pt-2">
      <h3
        id="ai-edit-recent"
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Recent requests
      </h3>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80">
        {sessions.map((item) => {
          const applied = item.changes.filter((change) => change.status === 'applied').length;
          const open = item.changes.filter((change) => change.status === 'proposed').length;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{describeBrief(item.brief)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      }),
                      applied > 0 ? `${applied} kept` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {open > 0 && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {open} to review
                  </span>
                )}
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DoneCard({
  applied,
  skipped,
  onNew,
  onClose,
}: {
  applied: number;
  skipped: number;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="animate-fade-up rounded-xl border border-emerald-600/20 bg-emerald-500/[0.06] p-5">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          aria-hidden
        >
          {applied > 0 ? <PartyPopper className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-section-title">
            {applied > 0 ? 'Your resume is updated' : 'All suggestions reviewed'}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[
              applied > 0 ? `${plural(applied, 'change')} kept` : 'Nothing kept',
              skipped > 0 ? `${skipped} skipped` : null,
            ]
              .filter(Boolean)
              .join(', ')}
            .{applied > 0 && ' Check the preview, and undo anything below if it does not fit.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pl-12">
        <Button type="button" size="sm" onClick={onClose}>
          Back to editor
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onNew}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Improve something else
        </Button>
      </div>
    </div>
  );
}
