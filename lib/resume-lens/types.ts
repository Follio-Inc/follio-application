/**
 * Recruiter reading lens — types.
 *
 * A lens is a view-state over an unchanged resume: which phrases to tint,
 * a one-line evidence strip, and where each phrase appears in the profile.
 */

import type { MatchBand } from '@/lib/jd-match/types';
import type { ProfileForMatch } from '@/lib/jd-match/build-resume-corpus';

export const MAX_LENS_PHRASES = 12;

export type LensPhraseKind = 'skill' | 'role' | 'keyword';

export type LensOccurrenceKind =
  | 'skill'
  | 'headline'
  | 'summary'
  | 'role'
  | 'experience'
  | 'project'
  | 'education'
  | 'certification';

export interface LensOccurrence {
  kind: LensOccurrenceKind;
  /** Short location, e.g. "Senior Backend Engineer · Stripe" */
  label: string;
  company?: string;
  year?: string | null;
  isCurrent?: boolean;
}

export interface LensPhrase {
  id: string;
  /** Display form as it appears on the resume when possible */
  phrase: string;
  kind: LensPhraseKind;
  occurrences: LensOccurrence[];
}

export interface ResumeLensResult {
  jobTitleHint: string | null;
  band: MatchBand;
  /** Recruiter-facing one-liner: "Strong on X. Light on Y." */
  strip: string;
  matched: string[];
  missing: string[];
  phrases: LensPhrase[];
}

export type LensWorkExperience = ProfileForMatch['workExperiences'][number] & {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  isCurrent?: boolean | null;
};

/** Profile shape needed to build a lens. PublicProfile is assignable. */
export type LensProfile = Omit<ProfileForMatch, 'workExperiences'> & {
  workExperiences: LensWorkExperience[];
};

export interface TextRange {
  start: number;
  end: number;
  phraseId: string;
}
