/**
 * Evaluate: scores computed by code, never by a model.
 *
 * Fast and free, so the builder runs them on every change: the four writing
 * checks (numbers, concise, action verbs, outcomes), raw job keyword
 * coverage, and what a single suggestion does to its line. The skill list
 * and requirement match live in `services/ai/skills`. Safe to import in
 * the browser.
 */

export { changeEffects } from './change';
export type { ChangeEffectInput } from './change';
export { keywordsIn, matchKeywords, readJobKeywords, termForms, termId } from './keywords';
export { LONG_LINE_WORDS, numbersIn, readLine } from './lines';
export {
  evaluateJobKeywords,
  evaluateResume,
  evaluateWriting,
  gradeRole,
  isScorableJob,
  lineIssue,
  resumeText,
} from './resume';
export type { GradedLine } from './resume';
export { emptyKeywordMatch } from './types';
export type {
  ChangeEffect,
  JobKeyword,
  JobKeywordCheck,
  KeywordMatch,
  LineIssue,
  LineSignals,
  RequirementMatch,
  ResumeEvaluation,
  ResumeSkill,
  ResumeSkillKind,
  SkillEvidence,
  SkillMatchCheck,
  SkillMatchKind,
  SkillSource,
  WritingCheck,
} from './types';
