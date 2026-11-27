/**
 * Line-level resume edits for connected assistants (Claude, ChatGPT).
 *
 * The assistant reads the resume as refs ("H", "S", "E1.2"), sends rewrites
 * against them, and Follio stores them as a normal AI edit session: grounded
 * the same way as in-app suggestions, visible in the builder, and undoable.
 */

import { z } from 'zod';

import { describeBrief } from '@/lib/resume-edit/review';
import {
  changeOp,
  explainProposal,
  RESUME_EDIT_LIMITS,
  type ResumeEditChange,
  type ResumeEditSessionView,
} from '@/lib/resume-edit/types';
import type { EditFacts } from '@/services/ai';
import { evaluateWriting } from '@/services/ai/evaluate';
import { WRITING_PLAYBOOKS } from '@/services/ai/resume-edit/playbooks';

const ref = z
  .string()
  .trim()
  .regex(
    /^(H|S|E\d+\.\d+\+?)$/,
    'Use a ref from get_resume_lines, like "H", "S", or "E1.2", or "E1.2+" to add after it.'
  );

const assistantChange = z
  .object({
    ref,
    text: z.string().trim().max(RESUME_EDIT_LIMITS.summaryMaxChars).optional(),
    remove: z.boolean().optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .superRefine((change, ctx) => {
    if (change.remove && !/^E\d+\.[1-9]\d*$/.test(change.ref)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only experience bullets can be removed.',
      });
    }
    if (!change.remove && !change.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Send the full new text, or remove: true.',
      });
    }
  });

export const SuggestResumeEditsSchema = z.object({
  request: z
    .string()
    .trim()
    .min(1, 'Say what the user asked for.')
    .max(RESUME_EDIT_LIMITS.instructionsMaxChars),
  userFacts: z.string().trim().max(RESUME_EDIT_LIMITS.instructionsMaxChars).optional(),
  jobDescription: z.string().trim().max(RESUME_EDIT_LIMITS.jobMaxChars).optional(),
  changes: z
    .array(assistantChange)
    .min(1, 'Send at least one change.')
    .max(RESUME_EDIT_LIMITS.maxChanges),
});

export const ResumeEditSelectionSchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  changeIds: z.array(ref).max(RESUME_EDIT_LIMITS.maxChanges).optional(),
});

export type SuggestResumeEditsInput = z.infer<typeof SuggestResumeEditsSchema>;
export type ResumeEditSelectionInput = z.infer<typeof ResumeEditSelectionSchema>;

/** The writing checks as an assistant reads them: score, where it stands, and the lines to fix. */
function assistantScores(facts: EditFacts) {
  const evaluation = evaluateWriting(facts);
  return {
    writing: evaluation.writing,
    checks: evaluation.checks.map((check) => ({
      check: check.label,
      score: check.score,
      summary: check.summary,
      target: check.target,
      lines: check.issues.map((issue) => ({ ref: issue.ref, issue: issue.issue })),
    })),
  };
}

/** What get_resume_lines returns. */
export function toResumeLinesView(facts: EditFacts) {
  return {
    writingGuide: {
      howToUse:
        'Apply only the playbooks the user asked for, in this order. "Tailor to the job" applies when they share a posting. Then call suggest_resume_edits.',
      playbooks: WRITING_PLAYBOOKS.map(({ name, goal, steps, doneWhen }) => ({
        name,
        goal,
        steps,
        doneWhen,
      })),
    },
    scores: assistantScores(facts),
    headline: { ref: 'H', text: facts.headline },
    summary: { ref: 'S', text: facts.summary },
    roles: facts.experiences.map((item) => ({
      ref: item.ref,
      role: item.label,
      dates: item.dates,
      ...(item.editable
        ? { bullets: item.bullets.map((bullet) => ({ ref: bullet.ref, text: bullet.text })) }
        : {
            note: 'Written as paragraphs or nested lists. Read-only here; the user can edit it in Follio.',
            text: item.bullets.map((bullet) => bullet.text),
          }),
    })),
    skills: facts.skills,
    education: facts.education,
    other: facts.other,
  };
}

/** The user's request and stated facts both count as evidence when grounding. */
export function assistantInstructions(input: SuggestResumeEditsInput): string {
  return [input.request, input.userFacts].filter(Boolean).join('\n');
}

function compactChange(change: ResumeEditChange) {
  const problem = change.status === 'proposed' ? explainProposal(change, change.after) : null;
  return {
    id: change.id,
    action: changeOp(change),
    where: change.label,
    status: change.status,
    before: change.before,
    after: change.applied?.text ?? change.after,
    reason: change.reason,
    ...(problem ? { needsInput: problem } : {}),
  };
}

/** A session as the assistant sees it: what was asked, and every change with its status. */
export function toAssistantSession(session: ResumeEditSessionView) {
  return {
    sessionId: session.id,
    request: describeBrief(session.brief),
    createdAt: session.createdAt,
    changes: session.changes.map(compactChange),
  };
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Plain guidance for the assistant after suggest_resume_edits. */
export function suggestionMessage(result: {
  saved: number;
  needsInput: number;
  dropped: number;
  ignored: number;
}): string {
  return [
    result.saved > 0
      ? `Saved ${count(result.saved, 'suggestion')}. The resume is unchanged.`
      : 'No suggestions were saved. The resume is unchanged.',
    result.needsInput > 0
      ? `${count(result.needsInput, 'line')} had a number the user never stated, now shown as [__]. Ask the user for the real number and suggest that line again with it in userFacts.`
      : null,
    result.dropped > 0
      ? `${count(result.dropped, 'rewrite')} removed for adding tools, names, titles, or numbers the resume and the user do not show. Ask the user before claiming them.`
      : null,
    result.ignored > 0
      ? `${count(result.ignored, 'rewrite')} ignored: unknown or read-only ref, duplicate, or same as the original.`
      : null,
    result.saved > 0
      ? 'Show the user each before and after. Call apply_resume_edits only after they confirm. They can also review these in Follio under Builder, Edit with AI.'
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface ApplySelection {
  /** Proposed and ready to write as suggested. */
  ready: ResumeEditChange[];
  /** Proposed, but the text still has a blank the user must fill. */
  needsInput: ResumeEditChange[];
  /** Asked for, but already applied, undone, skipped, or not in this session. */
  unavailable: string[];
}

/** Which changes apply_resume_edits can write. Omit ids to take every open suggestion. */
export function selectForApply(
  changes: ResumeEditChange[],
  ids: string[] | undefined
): ApplySelection {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const wanted = ids ? [...new Set(ids)] : changes.map((change) => change.id);
  const selection: ApplySelection = { ready: [], needsInput: [], unavailable: [] };
  for (const id of wanted) {
    const change = byId.get(id);
    if (!change || change.status !== 'proposed') {
      if (ids) selection.unavailable.push(id);
      continue;
    }
    if (explainProposal(change, change.after) === null) selection.ready.push(change);
    else selection.needsInput.push(change);
  }
  return selection;
}

/** Plain guidance for the assistant after apply_resume_edits. */
export function applyMessage(result: {
  applied: number;
  conflicted: number;
  needsInput: number;
  unavailable: number;
}): string {
  return [
    result.applied > 0
      ? `Applied ${count(result.applied, 'change')} to the live resume. undo_resume_edits reverses them.`
      : 'Nothing was applied.',
    result.conflicted > 0
      ? `${count(result.conflicted, 'line')} changed since the suggestion and ${result.conflicted === 1 ? 'was' : 'were'} left alone. Read the resume again and suggest fresh rewrites.`
      : null,
    result.needsInput > 0
      ? `${count(result.needsInput, 'line')} still ${result.needsInput === 1 ? 'has' : 'have'} a [__] blank. Ask the user for the number and suggest ${result.needsInput === 1 ? 'it' : 'them'} again.`
      : null,
    result.unavailable > 0
      ? `${count(result.unavailable, 'change')} ${result.unavailable === 1 ? 'was' : 'were'} already applied, undone, skipped, or not in this session.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Plain guidance for the assistant after undo_resume_edits. */
export function undoMessage(result: { reverted: number; kept: number }): string {
  return [
    result.reverted > 0
      ? `Undid ${count(result.reverted, 'change')}. Those lines read as they did before.`
      : 'Nothing was undone.',
    result.kept > 0
      ? `${count(result.kept, 'line')} ${result.kept === 1 ? 'was' : 'were'} edited since and kept as the user left ${result.kept === 1 ? 'it' : 'them'}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');
}
