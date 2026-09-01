/**
 * Resume ↔ job-description match types (extension MVP).
 */

export type MatchBand = 'strong' | 'good' | 'fair' | 'weak';

export interface ResumeCorpus {
  id: string;
  handle: string;
  resumeTitle: string;
  headline: string | null;
  summary: string | null;
  skills: string[];
  roles: string[];
  companies: string[];
  /** Flattened searchable text from experience, projects, education, etc. */
  bodyText: string;
}

export interface JdMatchResult {
  resumeId: string;
  handle: string;
  resumeTitle: string;
  score: number;
  band: MatchBand;
  label: string;
  matchedSkills: string[];
  missingKeywords: string[];
  summary: string;
}

export interface JdMatchResponse {
  pageUrl: string | null;
  jobTitleHint: string | null;
  jdPreview: string;
  results: JdMatchResult[];
  scoredAt: string;
}
