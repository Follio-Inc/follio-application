/**
 * Scores computed by code, not by a model. Every number here can be
 * explained as "X of Y lines pass", so the screen can say exactly why.
 */

import type { EditPresetId } from '@/lib/resume-edit/types';
import type { RequirementImportance, RequirementKind } from '@/services/ai/job-requirements/types';

/**
 * Absolute keyword overlap. A keyword counts when the same term is on the
 * other side. Written equivalents share one term: React.js and React, k8s
 * and Kubernetes. A shorter word does not count for a longer one.
 */
export interface KeywordMatch {
  /** Share of job keywords found on the resume, 0–100. Null when the job has none. */
  jobCoverage: number | null;
  /** Share of resume keywords found in the job, 0–100. Null when the resume has none. */
  resumeCoverage: number | null;
  /** Job keywords found on the resume, in job order. */
  presentOnResume: string[];
  /** Job keywords missing from the resume, in job order. */
  missingFromResume: string[];
  /** Resume keywords found in the job, in resume order. */
  presentInJob: string[];
  /** Resume keywords that do not appear in the job, in resume order. */
  onlyOnResume: string[];
}

export function emptyKeywordMatch(): KeywordMatch {
  return {
    jobCoverage: null,
    resumeCoverage: null,
    presentOnResume: [],
    missingFromResume: [],
    presentInJob: [],
    onlyOnResume: [],
  };
}

/** One job keyword, with equivalents collapsed into `id`. */
export interface JobKeyword {
  id: string;
  /** As the posting writes it. */
  label: string;
  /** Written forms to look for. Defaults to the alias group of `id`. */
  forms?: readonly string[];
}

/** What one resume line shows, read the way a resume writer grades it. */
export interface LineSignals {
  words: number;
  /** First word, lower case, e.g. "built". Empty for an empty line. */
  opener: string;
  /** The weak opening phrase as written, e.g. "Responsible for". Null when it opens well. */
  weakOpener: string | null;
  /** Opens with an action verb ("Built", "Lead", "Cut"). */
  actionOpener: boolean;
  /** States a figure: a digit, or a word such as "doubled" or "thousands". */
  hasNumber: boolean;
  /** Has a [__] blank waiting for the user's number. */
  hasBlank: boolean;
  /** Says what changed: a result verb, a percentage, money, or "resulting in". */
  showsResult: boolean;
  /** Opens with a result verb ("Cut", "Grew", "Saved"). */
  leadsWithResult: boolean;
  /** Filler phrases as written, e.g. ["successfully", "in order to"]. */
  filler: string[];
  /** Longer than a resume line should be. */
  tooLong: boolean;
}

/** A line that fails a check, with the reason in a few words. */
export interface LineIssue {
  ref: string;
  /** Role and company the line belongs to. */
  where: string;
  text: string;
  issue: string;
}

/** One writing check. Its id is the quick fix that improves it. */
export interface WritingCheck {
  id: EditPresetId;
  label: string;
  /** 0–100, or null when there are no lines to check. */
  score: number | null;
  passed: number;
  total: number;
  /** One sentence the user reads, e.g. "6 of 14 bullets have a number." */
  summary: string;
  /** What good looks like, e.g. "Aim for a number in at least 60% of bullets." */
  target: string;
  /** The first few lines that fail, in resume order. */
  issues: LineIssue[];
}

/** How much of the job's vocabulary the resume already uses. */
export interface JobKeywordCheck {
  /** 0–100, or null when the posting has no distinct keywords. */
  coverage: number | null;
  onResume: string[];
  missing: string[];
  summary: string;
}

/** Where on the resume a skill is written. */
export type SkillSource =
  | 'experience'
  | 'summary'
  | 'projects'
  | 'certifications'
  | 'skills'
  | 'education';

export type ResumeSkillKind = 'tool' | 'practice' | 'domain' | 'other';

/** One entry in the resume's own skill list, kept in step with every edit. */
export interface ResumeSkill {
  /** A skill-list id, or "x:" plus the folded name for skills the list does not know. */
  id: string;
  label: string;
  kind: ResumeSkillKind;
  where: SkillSource[];
  /** Lines that name or show it: "E1.2", "S", "K3". */
  refs: string[];
  /** Found by the model reading what the work implies, not by its name. */
  inferred: boolean;
  /** Other names for it, from the skill list or the model. */
  aliases: string[];
  /** Broader skill-list ids the model placed it under, for skills the list does not know. */
  broader: string[];
}

/**
 * How well the resume backs one requirement. Shown: experience, summary, a
 * project, or a certification says it. Listed: only the skills or education
 * section names it.
 */
export type SkillEvidence = 'shown' | 'listed' | 'missing';

/**
 * Exact: the same skill, under any of its names. Implied: a more specific
 * skill proves it, e.g. PostgreSQL for SQL. Related: a close skill, e.g.
 * MySQL for PostgreSQL, or a degree in the right field at a lower level.
 */
export type SkillMatchKind = 'exact' | 'implied' | 'related' | 'missing';

export interface RequirementMatch {
  term: string;
  kind: RequirementKind;
  importance: RequirementImportance;
  match: SkillMatchKind;
  evidence: SkillEvidence;
  where: SkillSource[];
  /** The resume's own words that matched, when they differ from the term, e.g. "PostgreSQL" for SQL. */
  via: string | null;
  /** Ids of the resume skills that matched. */
  skills: string[];
}

/**
 * The posting's real requirements against the resume's skills. Required
 * skills weigh double, a skill only listed earns part of the credit, and a
 * related skill earns half.
 */
export interface SkillMatchCheck {
  /** 0–100, or null when the posting asks for no specific skills. */
  score: number | null;
  /** Met means an exact or implied match; related matches are counted apart. */
  required: { met: number; total: number };
  preferred: { met: number; total: number };
  /** Requirements with only a related skill on the resume. */
  related: number;
  /** Matched, but only named in the skills or education section. */
  listedOnly: number;
  /** Required first, each in posting order. */
  matches: RequirementMatch[];
  summary: string;
}

export interface ResumeEvaluation {
  /** Average of the writing checks, or null when the resume has no bullets. */
  writing: number | null;
  checks: WritingCheck[];
  bulletCount: number;
  /** Raw keyword overlap. Null when no job description was given. */
  job: JobKeywordCheck | null;
  /** Null until the posting's requirements are read. */
  skills: SkillMatchCheck | null;
  resumeSkills: ResumeSkill[];
}

/** What a suggestion does to its line, e.g. "Adds a number" or "Drops a number". */
export interface ChangeEffect {
  tone: 'gain' | 'loss';
  label: string;
}
