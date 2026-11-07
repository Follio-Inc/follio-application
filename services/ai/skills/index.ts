/**
 * Skills: one shared skill list, the resume's own skills, and how they
 * answer a posting's requirements. Safe to import in the browser; the
 * model read of a resume lives in `services/ai/resume-skills`.
 */

import type { SkillMatchCheck } from '@/services/ai/evaluate/types';
import type { JobRequirement } from '@/services/ai/job-requirements/types';
import type { EditFacts } from '@/services/ai/resume-edit/facts';

import { matchRequirements } from './match';
import { readResumeSkills } from './profile';
import type { StoredSkillProfile } from './types';

export {
  ancestorsOf,
  catalogEntry,
  categoryNames,
  customSkillId,
  resolveSkill,
  scanSkills,
} from './catalog';
export {
  DEGREE_LEVEL_LABELS,
  fieldLabel,
  matchDegree,
  readDegreeRequirement,
  readResumeDegree,
} from './education';
export type { DegreeLevel, DegreeMatch, DegreeRequirement, ResumeDegree } from './education';
export { LISTED_CREDIT, matchRequirements, RELATED_CREDIT, SKILL_SOURCE_LABELS } from './match';
export { readResumeSkills, readSkillLines, SKILL_SOURCES } from './profile';
export { SKILL_PROFILE_LIMITS, SKILL_PROFILE_VERSION } from './types';
export type { SkillLine, StoredSkill, StoredSkillProfile } from './types';

/** The resume's skills, read fresh, against the posting's requirements. */
export function evaluateSkillMatch(
  facts: EditFacts,
  requirements: readonly JobRequirement[],
  stored: StoredSkillProfile | null = null
): SkillMatchCheck {
  return matchRequirements(facts, readResumeSkills(facts, stored), requirements);
}
