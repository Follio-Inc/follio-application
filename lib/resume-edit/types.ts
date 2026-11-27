/**
 * AI resume edits, as the builder panel and the API see them.
 *
 * A session is one request ("tailor to this job", "add more numbers") and the
 * small, typed changes it produced. Changes are proposals until the user
 * applies them, and every applied change keeps what it replaced so it can be
 * undone.
 */

/** Where the model is allowed to write a number it does not have. The user fills it in. */
export const EDIT_PLACEHOLDER = '[__]';

export const RESUME_EDIT_LIMITS = {
  jobMinChars: 80,
  jobMaxChars: 16_000,
  instructionsMaxChars: 600,
  headlineMaxChars: 160,
  summaryMaxChars: 1_200,
  bulletMaxChars: 400,
  /** Experience entries rewritten per request. The most recent ones go first. */
  maxExperiences: 6,
  maxChanges: 40,
  /** New bullets one request may add to a single role. */
  maxNewBulletsPerRole: 2,
  /** A role never drops below this many bullets through suggested removals. */
  minBulletsPerRole: 2,
  /** Requests per user per rolling day. */
  dailySessions: 30,
  /** Suggestion sets a connected assistant (Claude, ChatGPT) may save per rolling day. */
  assistantDailySessions: 100,
} as const;

export const EDIT_PRESETS = [
  { id: 'quantify', label: 'Add numbers', hint: 'Show scale and results' },
  { id: 'concise', label: 'Tighten', hint: 'Shorter, no filler' },
  { id: 'verbs', label: 'Stronger verbs', hint: 'Lead with action' },
  { id: 'outcomes', label: 'Lead with outcomes', hint: 'Result first, task second' },
] as const;

export type EditPresetId = (typeof EDIT_PRESETS)[number]['id'];

export type EditScope =
  | { kind: 'all' }
  | { kind: 'summary' }
  | { kind: 'experience'; experienceId: string };

export interface ResumeEditBrief {
  jobDescription: string | null;
  instructions: string | null;
  presets: EditPresetId[];
  scope: EditScope;
  /** The connected assistant that wrote these suggestions, e.g. "Claude". Unset for builder requests. */
  via?: string | null;
}

/**
 * Where a change lands. For a bullet, `index` is its position when the change
 * was suggested; for a new bullet, the position it would take. Positions are
 * hints only: apply and undo find lines by their text.
 */
export type EditTarget =
  | { kind: 'headline' }
  | { kind: 'summary' }
  | { kind: 'bullet'; experienceId: string; index: number };

/** `insert` and `delete` only target bullets. */
export type EditOp = 'rewrite' | 'insert' | 'delete';

export type EditChangeStatus =
  | 'proposed'
  | 'rejected'
  | 'applied'
  | 'reverted'
  /** The field changed after the suggestion was made, so it was not applied. */
  | 'conflicted';

export interface ResumeEditChange {
  id: string;
  /** Sessions saved before inserts and deletes existed omit this; read it with changeOp(). */
  op?: EditOp;
  target: EditTarget;
  /** Where it lives, for grouping: "Summary", "Staff Engineer · Acme". */
  label: string;
  /** Plain text at the time of the suggestion. Empty for an insert. */
  before: string;
  /** Plain text the model proposed. May contain EDIT_PLACEHOLDER. Empty for a delete. */
  after: string;
  /** Insert only: text of the bullet the new one follows, or null to go first. */
  anchor?: string | null;
  /** One short line on why. */
  reason: string;
  status: EditChangeStatus;
  /** Set once applied: the exact stored value it replaced, and the text written. */
  applied?: AppliedEdit;
}

export interface AppliedEdit {
  /** Stored value before the change; for a delete, the removed item's inner markup. */
  previousRaw: string;
  /** Text written; empty for a delete. */
  text: string;
  at: string;
  /** Insert and delete: the line's position when applied, and the text it followed. */
  index?: number;
  anchor?: string | null;
}

export function changeOp(change: Pick<ResumeEditChange, 'op'>): EditOp {
  return change.op ?? 'rewrite';
}

export interface ResumeEditSessionView {
  id: string;
  profileId: string;
  brief: ResumeEditBrief;
  changes: ResumeEditChange[];
  /** Suggestions removed because they claimed something the resume does not show. */
  droppedCount: number;
  /** Sections the model could not finish, in plain words. */
  failedSections: string[];
  createdAt: string;
}

export function hasPlaceholder(text: string): boolean {
  return text.includes(EDIT_PLACEHOLDER);
}

export function maxCharsFor(target: EditTarget): number {
  if (target.kind === 'headline') return RESUME_EDIT_LIMITS.headlineMaxChars;
  if (target.kind === 'summary') return RESUME_EDIT_LIMITS.summaryMaxChars;
  return RESUME_EDIT_LIMITS.bulletMaxChars;
}

/** Why this text cannot be written to the resume yet, or null when it can. */
export function explainChangeText(target: EditTarget, text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'This line is empty.';
  if (hasPlaceholder(trimmed))
    return `Replace ${EDIT_PLACEHOLDER} with your real number, or remove it.`;
  if (trimmed.length > maxCharsFor(target)) return 'This is too long for one line.';
  return null;
}

/** Why this suggestion cannot be kept with this text, or null when it can. A delete has no text. */
export function explainProposal(
  change: Pick<ResumeEditChange, 'op' | 'target'>,
  text: string
): string | null {
  return changeOp(change) === 'delete' ? null : explainChangeText(change.target, text);
}

/** Plain-language reason the request cannot be sent, or null when it can. */
export function explainBrief(brief: {
  jobDescription: string | null;
  instructions: string | null;
  presets: readonly string[];
}): string | null {
  const job = brief.jobDescription?.trim() ?? '';
  const instructions = brief.instructions?.trim() ?? '';
  const { jobMinChars, jobMaxChars, instructionsMaxChars } = RESUME_EDIT_LIMITS;

  if (!job && !instructions && brief.presets.length === 0) {
    return 'Say what to change, pick a quick fix, or add a job description.';
  }
  if (job && job.length < jobMinChars) return 'Add a bit more of the job description.';
  if (job.length > jobMaxChars) {
    return 'That job description is too long. Paste the posting, not the whole page.';
  }
  if (instructions.length > instructionsMaxChars) {
    return `Keep instructions under ${instructionsMaxChars} characters.`;
  }
  return null;
}
