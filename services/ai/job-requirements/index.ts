/**
 * Read: what a job posting asks for, without the company, benefits, and
 * legal text. Server only; the browser imports `./types`.
 */

export {
  buildJobRequirementsUserPrompt,
  JOB_REQUIREMENTS_SYSTEM_PROMPT,
  readJobRequirements,
} from './extract';
export { parseJobRequirements } from './parse';
export {
  JOB_REQUIREMENT_LIMITS,
  REQUIREMENT_KINDS,
  type JobRequirement,
  type RequirementImportance,
  type RequirementKind,
} from './types';
