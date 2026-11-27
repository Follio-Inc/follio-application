/**
 * What the AI edit panel and the resume preview show while the user reviews a
 * session: which suggestions can be kept as they stand, which need input, and
 * how to name each one in a few words.
 */

import {
  changeOp,
  EDIT_PLACEHOLDER,
  EDIT_PRESETS,
  explainProposal,
  type ResumeEditBrief,
  type ResumeEditChange,
} from './types';

export interface ReviewSummary {
  total: number;
  applied: number;
  /** Still proposed and not skipped by the user. */
  open: number;
  /** Open, but the text still has a blank or another problem to fix first. */
  needsInput: number;
  skipped: number;
  /** Open changes that can be applied with their current text. */
  readyIds: string[];
}

export function textFor(change: ResumeEditChange, texts: Record<string, string>): string {
  return texts[change.id] ?? change.after;
}

/** Waiting on the user: suggested, and not set aside for now. */
export function isOpenChange(change: ResumeEditChange, skipped: ReadonlySet<string>): boolean {
  return change.status === 'proposed' && !skipped.has(change.id);
}

export function summarizeReview(
  changes: ResumeEditChange[],
  texts: Record<string, string>,
  skipped: ReadonlySet<string>
): ReviewSummary {
  const summary: ReviewSummary = {
    total: changes.length,
    applied: 0,
    open: 0,
    needsInput: 0,
    skipped: 0,
    readyIds: [],
  };
  for (const change of changes) {
    if (change.status === 'applied') summary.applied += 1;
    if (change.status === 'rejected') summary.skipped += 1;
    if (change.status !== 'proposed') continue;
    if (skipped.has(change.id)) {
      summary.skipped += 1;
      continue;
    }
    summary.open += 1;
    if (explainProposal(change, textFor(change, texts)) === null) {
      summary.readyIds.push(change.id);
    } else {
      summary.needsInput += 1;
    }
  }
  return summary;
}

/** Short name for one change inside its group: "Headline", "Bullet 3", "New bullet". */
export function changeTitle(change: ResumeEditChange): string {
  if (change.target.kind !== 'bullet') return change.label;
  return changeOp(change) === 'insert' ? 'New bullet' : `Bullet ${change.target.index + 1}`;
}

/** The action that accepts a suggestion. "Keep" would read as keeping the line for a removal. */
export function keepLabel(change: ResumeEditChange): 'Keep' | 'Remove' {
  return changeOp(change) === 'delete' ? 'Remove' : 'Keep';
}

/** Past tense of keepLabel, for suggestions already accepted. */
export function keptLabel(change: ResumeEditChange): 'Kept' | 'Removed' {
  return changeOp(change) === 'delete' ? 'Removed' : 'Kept';
}

/** "Keep all 4", or "Keep 3 ready" while others still wait on the user. */
export function keepAllLabel(review: ReviewSummary): string {
  const ready = review.readyIds.length;
  return review.needsInput > 0 ? `Keep ${ready} ready` : `Keep all ${ready}`;
}

/** Group heading: the role for bullets, "Headline and summary" for the rest. */
export function changeGroup(change: ResumeEditChange): string {
  return change.target.kind === 'bullet' ? change.label : 'Headline and summary';
}

export function groupChanges(changes: ResumeEditChange[]): Array<[string, ResumeEditChange[]]> {
  const groups = new Map<string, ResumeEditChange[]>();
  for (const change of changes) {
    const key = changeGroup(change);
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  return [...groups.entries()];
}

/** The request in a few words, e.g. `Tailored to a job · Add numbers`. */
export function describeBrief(brief: ResumeEditBrief, maxInstructionChars = 60): string {
  const parts: string[] = [];
  if (brief.via) parts.push(`From ${brief.via}`);
  if (brief.instructions) {
    const text = brief.instructions.replace(/\s+/g, ' ').trim();
    parts.push(
      text.length > maxInstructionChars ? `“${text.slice(0, maxInstructionChars)}…”` : `“${text}”`
    );
  }
  if (brief.jobDescription) parts.push('Tailored to a job');
  parts.push(
    ...EDIT_PRESETS.filter((preset) => brief.presets.includes(preset.id)).map((p) => p.label)
  );
  return parts.join(' · ') || 'AI edits';
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Text around each blank: `["Cut costs by ", "% at Acme"]` has one blank. */
export function splitBlanks(template: string): string[] {
  return template.split(EDIT_PLACEHOLDER);
}

/** The template with each blank replaced by what the user typed. Empty answers stay blank. */
export function fillBlanks(template: string, answers: readonly string[]): string {
  return splitBlanks(template).reduce(
    (text, piece, index) =>
      index === 0 ? piece : text + (answers[index - 1]?.trim() || EDIT_PLACEHOLDER) + piece,
    ''
  );
}
