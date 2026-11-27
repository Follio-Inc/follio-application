/**
 * Resume skills: the model's read of the skills each resume line shows,
 * saved with the line text it read. Server only.
 */

export { hashSkillLines, readResumeSkillsWithModel } from './extract';
export { parseResumeSkills, readStoredSkillProfile } from './parse';
export { buildResumeSkillsSystemPrompt, buildResumeSkillsUserPrompt } from './prompt';
