/**
 * Judge: a model's opinion of a resume, the way a recruiter would give it.
 *
 * Slower and paid, so screens ask for it on purpose rather than on every
 * keystroke. parseExpertRead is what the screen trusts; a read that does not
 * parse is dropped, never guessed at.
 */

export {
  buildJobFitUserPrompt,
  JOB_FIT_SYSTEM_PROMPT,
  judgeJobFit,
  parseExpertRead,
} from './job-fit';
export { expertBand } from './types';
export type { ExpertNote, ExpertRead } from './types';
