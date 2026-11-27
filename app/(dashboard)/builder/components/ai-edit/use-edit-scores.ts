'use client';

import { useDeferredValue, useMemo } from 'react';

import { textFor } from '@/lib/resume-edit/review';
import { scoreResume, sessionSources, type ScoredResume } from '@/lib/resume-edit/scores';
import { readJobKeywords, termForms, termId, type JobKeyword } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import type { EditSourceProfile } from '@/services/ai/resume-edit/facts';

import { useBuilderStore } from '../builder-store-provider';
import { useAiEditReview } from './ai-edit-review';
import { useStoredSkillProfile, type SkillReadStatus } from './use-skill-profile';

/** The resume open in the editor, including edits not saved yet. */
function useDraftSource(): EditSourceProfile {
  return useBuilderStore((s) => s.draftProfile);
}

/** The saved model read of the open resume's skills. */
export function useSkillRead() {
  const profileId = useBuilderStore((s) => s.draftProfile.id);
  return useStoredSkillProfile(profileId);
}

export interface CurrentScores extends ScoredResume {
  skillRead: SkillReadStatus;
}

/**
 * Scores for the resume as it reads now. The job text is deferred so typing
 * a posting stays smooth. `requirements` adds the skills match once read.
 */
export function useCurrentScores(
  jobDescription: string | null,
  requirements: readonly JobRequirement[] | null = null
): CurrentScores {
  const source = useDraftSource();
  const { profile, status } = useSkillRead();
  const job = useDeferredValue(jobDescription);
  const scored = useMemo(
    () => scoreResume(source, job, requirements, profile),
    [job, profile, requirements, source]
  );
  return useMemo(() => ({ ...scored, skillRead: status }), [scored, status]);
}

export interface SessionScores {
  /** Before anything from this request was kept. */
  before: ScoredResume;
  /** As it reads now. */
  now: ScoredResume;
  /** As it reads now, plus every suggestion that is ready to keep. */
  after: ScoredResume;
  /** Ready suggestions counted in `after`. Zero means `after` is the resume as it reads now. */
  readyCount: number;
  skillRead: SkillReadStatus;
}

/** Before and after scores for the open request, updated as suggestions are kept, skipped, or edited. */
export function useSessionScores(
  requirements: readonly JobRequirement[] | null = null
): SessionScores | null {
  const source = useDraftSource();
  const { profile, status } = useSkillRead();
  const { session, texts, review } = useAiEditReview();
  const readyIds = review?.readyIds;
  const deferredTexts = useDeferredValue(texts);

  return useMemo(() => {
    if (!session || !readyIds) return null;
    const byId = new Map(session.changes.map((change) => [change.id, change]));
    const ready = new Map(
      readyIds.flatMap((id) => {
        const change = byId.get(id);
        return change ? [[id, textFor(change, deferredTexts)] as const] : [];
      })
    );
    const job = session.brief.jobDescription;
    const sources = sessionSources(source, session.changes, ready);
    const score = (from: EditSourceProfile) => scoreResume(from, job, requirements, profile);
    const now = score(source);
    return {
      before: sources.before === source ? now : score(sources.before),
      now,
      after: sources.after === source ? now : score(sources.after),
      readyCount: ready.size,
      skillRead: status,
    };
  }, [deferredTexts, profile, readyIds, requirements, session, source, status]);
}

/**
 * Terms of the request's posting, for labelling what each suggestion
 * surfaces: its requirements once read, its raw keywords until then.
 */
export function useJobKeywords(
  jobDescription: string | null | undefined,
  requirements: readonly JobRequirement[] | null = null
): JobKeyword[] {
  return useMemo(() => {
    if (requirements) {
      return requirements.map((requirement) => ({
        id: termId(requirement.term),
        label: requirement.term,
        forms: termForms(requirement.term, requirement.aliases),
      }));
    }
    return readJobKeywords(jobDescription ?? '');
  }, [jobDescription, requirements]);
}
