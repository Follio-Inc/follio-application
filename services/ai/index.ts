/**
 * Product AI features, server side.
 *
 * The work, each kind in its own folder:
 * - job-requirements: read. What a posting asks for, without the company,
 *                benefits, and legal text. One cached model call per posting.
 * - resume-skills: read. The skills each resume line shows, even unnamed,
 *                saved after edits so matching never waits on a model.
 * - skills:      match by code. One shared skill list with every name for each
 *                skill and the broader skills it belongs to, degrees compared by
 *                level and field, and the resume's skills against a posting.
 * - resume-edit: write. Playbooks, prompt, and grounding for line edits.
 * - jd-align:    explain. Marks which job requirements the resume supports (/match).
 * - evaluate:    score by code. Writing checks and raw keyword coverage;
 *                no model, safe in the browser, cheap enough to run on every change.
 * - judge:       score by model. A recruiter's read; slower, asked for on purpose.
 *
 * Each feature owns its prompt, its checks, and one public function. UI and
 * routes call that function. They do not call the model themselves, and they
 * do not keep a second copy of the rules. Browser code imports evaluate and
 * skills directly, and the read and judge folders only for their types and
 * parsers, so no model client reaches the bundle.
 */

export { evaluateResume, matchKeywords, resumeText } from './evaluate';
export type { KeywordMatch, ResumeEvaluation } from './evaluate';
export { alignResumeToJob } from './jd-align';
export type { JdAlignResult } from './jd-align';
export { readJobRequirements } from './job-requirements';
export type { JobRequirement } from './job-requirements';
export { judgeJobFit } from './judge';
export type { ExpertRead } from './judge';
export {
  buildEditFacts,
  groundAssistantEdits,
  proposeResumeEdits,
  WRITING_PLAYBOOKS,
} from './resume-edit';
export type {
  AssistantEditResult,
  EditFacts,
  EditSourceProfile,
  ResumeEditProposal,
  WritingPlaybook,
} from './resume-edit';
