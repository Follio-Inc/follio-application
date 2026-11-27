'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  applyResumeEdits,
  listResumeEdits,
  revertResumeEdits,
  type ResumeEditPatch,
  type ResumeEditResponse,
} from '@/lib/resume-edit/client';
import { editableDocument } from '@/lib/resume-edit/document';
import { buildRedline, type ResumeRedline } from '@/lib/resume-edit/redline';
import { plural, summarizeReview, textFor, type ReviewSummary } from '@/lib/resume-edit/review';
import type { ResumeEditSessionView } from '@/lib/resume-edit/types';
import { hasProfileChanges } from '@/lib/stores/builder-store';

import type { FullProfile } from '@/types';

import { useBuilderStore } from '../builder-store-provider';

/** What a request in flight is for, so only that control shows a spinner. */
export type ReviewPending = { kind: 'keep' | 'undo'; id: string | null } | null;

export interface AiEditReview {
  /** The AI panel is open. Suggestions are drawn into the resume only then. */
  active: boolean;
  session: ResumeEditSessionView | null;
  recent: ResumeEditSessionView[];
  texts: Record<string, string>;
  skipped: ReadonlySet<string>;
  review: ReviewSummary | null;
  /** Open suggestions marked in the resume, or null when there are none to show. */
  redline: ResumeRedline | null;
  pending: ReviewPending;
  busy: boolean;
  /** The editor has edits that are not saved; keeping would write over them. */
  unsaved: boolean;
  /** Keeping is blocked: a request is in flight, or the editor has unsaved edits. */
  locked: boolean;
  error: string | null;
  notice: string | null;
  announcement: string;
  openSession: (view: ResumeEditSessionView) => void;
  closeSession: () => void;
  rememberSession: (view: ResumeEditSessionView) => void;
  setText: (id: string, text: string) => void;
  setSkip: (id: string, skip: boolean) => void;
  keep: (ids: string[]) => Promise<void>;
  undo: (ids: string[] | null) => Promise<void>;
  setError: (message: string | null) => void;
}

interface FocusState {
  /** The suggestion under the pointer or keyboard focus, in the panel or in the resume. */
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}

const ReviewContext = createContext<AiEditReview | null>(null);
// Separate so hovering a suggestion does not re-render the resume.
const FocusContext = createContext<FocusState | null>(null);

const RECENT_LIMIT = 5;

interface AiEditReviewProviderProps {
  active: boolean;
  /** Called after the resume itself changed, so editors can reload what they show. */
  onResumeChanged: () => void;
  children: ReactNode;
}

/**
 * Review state for one AI edit session, shared by the AI panel and the resume
 * preview so both show the same suggestions and keep them the same way.
 */
export function AiEditReviewProvider({
  active,
  onResumeChanged,
  children,
}: AiEditReviewProviderProps) {
  const draftProfile = useBuilderStore((s) => s.draftProfile);
  const savedProfile = useBuilderStore((s) => s.savedProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const unsaved = hasProfileChanges(draftProfile, savedProfile);

  const [profileId, setProfileId] = useState(draftProfile.id);
  const [session, setSession] = useState<ResumeEditSessionView | null>(null);
  const [recent, setRecent] = useState<ResumeEditSessionView[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReviewPending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Suggestions belong to one resume. Switching resumes starts over.
  if (profileId !== draftProfile.id) {
    setProfileId(draftProfile.id);
    setSession(null);
    setRecent([]);
    setTexts({});
    setSkipped(new Set());
    setError(null);
    setNotice(null);
    setFocusedId(null);
  }

  useEffect(() => {
    if (!active) return;
    let alive = true;
    listResumeEdits()
      .then((result) => {
        if (alive) setRecent(result.sessions);
      })
      .catch(() => {
        // Earlier requests are a convenience; the panel works without them.
      });
    return () => {
      alive = false;
    };
  }, [active, profileId]);

  const openSession = useCallback((view: ResumeEditSessionView) => {
    setSession(view);
    setTexts(Object.fromEntries(view.changes.map((change) => [change.id, change.after])));
    setSkipped(new Set());
    setError(null);
    setNotice(null);
  }, []);

  const closeSession = useCallback(() => {
    setSession(null);
    setError(null);
    setNotice(null);
    setFocusedId(null);
  }, []);

  const rememberSession = useCallback((view: ResumeEditSessionView) => {
    setRecent((current) =>
      [view, ...current.filter((item) => item.id !== view.id)].slice(0, RECENT_LIMIT)
    );
  }, []);

  const setText = useCallback(
    (id: string, text: string) => setTexts((current) => ({ ...current, [id]: text })),
    []
  );

  const setSkip = useCallback((id: string, skip: boolean) => {
    setSkipped((current) => {
      const next = new Set(current);
      if (skip) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const review = useMemo(
    () => (session ? summarizeReview(session.changes, texts, skipped) : null),
    [session, skipped, texts]
  );

  // Closing the panel after every suggestion is settled starts fresh next time.
  const settled = review?.open === 0;
  useEffect(() => {
    if (!active && settled) closeSession();
  }, [active, closeSession, settled]);

  const { headline, summary, workExperiences } = draftProfile;
  const redline = useMemo(() => {
    if (!active || !session || !review || review.open === 0) return null;
    return buildRedline(editableDocument({ headline, summary, workExperiences }), session.changes, {
      texts,
      skipped,
    });
  }, [active, headline, review, session, skipped, summary, texts, workExperiences]);

  const applyPatch = useCallback(
    (patch: ResumeEditPatch) => {
      const updates: Partial<FullProfile> = {};
      if (patch.headline !== undefined) updates.headline = patch.headline;
      if (patch.summary !== undefined) updates.summary = patch.summary;
      if (patch.workExperiences?.length) {
        const byId = new Map(patch.workExperiences.map((item) => [item.id, item]));
        updates.workExperiences = savedProfile.workExperiences.map((item) => {
          const next = byId.get(item.id);
          return next ? { ...item, bullets: next.bullets, bulletsHtml: next.bulletsHtml } : item;
        });
      }
      if (Object.keys(updates).length === 0) return;
      commitInlineChange(updates);
      onResumeChanged();
    },
    [commitInlineChange, onResumeChanged, savedProfile.workExperiences]
  );

  const finish = useCallback(
    (result: ResumeEditResponse) => {
      setSession(result.session);
      rememberSession(result.session);
      applyPatch(result.patch);
    },
    [applyPatch, rememberSession]
  );

  const keep = useCallback(
    async (ids: string[]) => {
      if (!session || ids.length === 0) return;
      setPending({ kind: 'keep', id: ids.length === 1 ? ids[0] : null });
      setError(null);
      setNotice(null);
      try {
        const byId = new Map(session.changes.map((change) => [change.id, change]));
        const result = await applyResumeEdits(session.id, {
          apply: ids.flatMap((id) => {
            const change = byId.get(id);
            return change ? [{ id, text: textFor(change, texts) }] : [];
          }),
          reject: [],
        });
        finish(result);
        const outcomes = Object.values(result.outcomes);
        const kept = outcomes.filter((outcome) => outcome === 'applied').length;
        const conflicted = outcomes.length - kept;
        setAnnouncement(kept > 0 ? `Kept ${plural(kept, 'change')}.` : '');
        if (conflicted > 0) {
          setNotice(
            `${plural(conflicted, 'line')} changed after the suggestion was made, so ${conflicted === 1 ? 'it was' : 'they were'} left alone.`
          );
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Keeping failed. Try again.');
      } finally {
        setPending(null);
      }
    },
    [finish, session, texts]
  );

  const undo = useCallback(
    async (ids: string[] | null) => {
      if (!session) return;
      setPending({ kind: 'undo', id: ids?.length === 1 ? ids[0] : null });
      setError(null);
      setNotice(null);
      try {
        const result = await revertResumeEdits(session.id, ids);
        finish(result);
        const outcomes = Object.values(result.outcomes);
        const reverted = outcomes.filter((outcome) => outcome === 'reverted').length;
        const kept = outcomes.filter((outcome) => outcome === 'kept').length;
        setAnnouncement(reverted > 0 ? `Undid ${plural(reverted, 'change')}.` : '');
        if (kept > 0) {
          setNotice(
            `${plural(kept, 'line')} you edited since ${kept === 1 ? 'was' : 'were'} kept as you left ${kept === 1 ? 'it' : 'them'}.`
          );
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Undo failed. Try again.');
      } finally {
        setPending(null);
      }
    },
    [finish, session]
  );

  const busy = pending !== null;
  const value = useMemo<AiEditReview>(
    () => ({
      active,
      session,
      recent,
      texts,
      skipped,
      review,
      redline,
      pending,
      busy,
      unsaved,
      locked: busy || unsaved,
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
    }),
    [
      active,
      announcement,
      busy,
      closeSession,
      error,
      keep,
      notice,
      openSession,
      pending,
      recent,
      redline,
      rememberSession,
      review,
      session,
      setSkip,
      setText,
      skipped,
      texts,
      undo,
      unsaved,
    ]
  );
  const focus = useMemo(() => ({ focusedId, setFocusedId }), [focusedId]);

  return (
    <ReviewContext.Provider value={value}>
      <FocusContext.Provider value={focus}>{children}</FocusContext.Provider>
    </ReviewContext.Provider>
  );
}

export function useAiEditReview(): AiEditReview {
  const review = useContext(ReviewContext);
  if (!review) throw new Error('useAiEditReview must be used inside AiEditReviewProvider');
  return review;
}

export function useAiEditFocus(): FocusState {
  const focus = useContext(FocusContext);
  if (!focus) throw new Error('useAiEditFocus must be used inside AiEditReviewProvider');
  return focus;
}
