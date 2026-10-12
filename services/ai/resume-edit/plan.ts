/**
 * What every batch of one request shares, worked out once before any
 * rewriting: which playbooks apply, and, when tailoring, which of the job's
 * requirements the resume already shows (surface them) and which it does
 * not (never add them). Batches run in parallel, so without this each one
 * would read the posting on its own and could emphasize different things.
 */

import type { ResumeEditBrief } from '@/lib/resume-edit/types';
import { evaluateJobKeywords, type RequirementMatch } from '@/services/ai/evaluate';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import { evaluateSkillMatch, type StoredSkillProfile } from '@/services/ai/skills';

import type { EditFacts } from './facts';
import { selectPlaybooks, type WritingPlaybook } from './playbooks';

const MAX_PLAN_KEYWORDS = 20;

export interface WritingPlan {
  playbooks: WritingPlaybook[];
  /** Null when the request has no job description. */
  job: {
    /** Required first. */
    onResume: string[];
    /** Named only in the skills or education section, not shown in any line. */
    listedOnly: string[];
    /** Not on the resume. A close skill does not count: MySQL is not PostgreSQL. */
    missing: string[];
  } | null;
}

/** "SQL (as PostgreSQL)", so the model uses the resume's own word for it. */
function planTerm(match: RequirementMatch): string {
  return match.match === 'implied' && match.via ? `${match.term} (as ${match.via})` : match.term;
}

function jobPlan(
  facts: EditFacts,
  brief: ResumeEditBrief,
  requirements: readonly JobRequirement[] | null,
  storedSkills: StoredSkillProfile | null
): WritingPlan['job'] {
  if (requirements && requirements.length > 0) {
    const { matches } = evaluateSkillMatch(facts, requirements, storedSkills);
    const met = matches.filter((match) => match.match === 'exact' || match.match === 'implied');
    const terms = (list: RequirementMatch[]) => list.map(planTerm).slice(0, MAX_PLAN_KEYWORDS);
    return {
      onResume: terms(met),
      listedOnly: terms(met.filter((match) => match.evidence === 'listed')),
      missing: terms(matches.filter((match) => !met.includes(match))),
    };
  }
  const keywords = evaluateJobKeywords(facts, brief.jobDescription);
  if (!keywords) return null;
  return {
    onResume: keywords.onResume.slice(0, MAX_PLAN_KEYWORDS),
    listedOnly: [],
    missing: keywords.missing.slice(0, MAX_PLAN_KEYWORDS),
  };
}

/**
 * `requirements` is the posting as the requirements step read it. Without
 * it, the plan falls back to raw keywords from the whole pasted text.
 * `storedSkills` adds the skills the model found the work shows.
 */
export function planWriting(
  facts: EditFacts,
  brief: ResumeEditBrief,
  requirements: readonly JobRequirement[] | null = null,
  storedSkills: StoredSkillProfile | null = null
): WritingPlan {
  return {
    playbooks: selectPlaybooks(brief),
    job: brief.jobDescription ? jobPlan(facts, brief, requirements, storedSkills) : null,
  };
}
