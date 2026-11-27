/**
 * Line edits written by a connected assistant (Claude, ChatGPT) instead of
 * Follio's model. They pass the same grounding as in-app suggestions; the
 * assistant may also edit every role, not just the most recent ones.
 */

import type { ResumeEditChange } from '@/lib/resume-edit/types';

import type { EditFacts } from './facts';
import { groundEdits } from './ground';

export interface AssistantEditInput {
  /** Rewrite `ref`, add after it with a "+" ref, or remove it with `remove: true`. */
  changes: Array<{ ref: string; text?: string; remove?: boolean; reason?: string }>;
  /** The user's request and any facts they stated in the conversation. */
  instructions: string;
  jobDescription: string | null;
}

export interface AssistantEditResult {
  changes: ResumeEditChange[];
  /** Removed for claiming something the resume and the user's words do not show. */
  dropped: number;
  /** Unknown or duplicate refs, read-only lines, and rewrites identical to the original. */
  ignored: number;
}

/** Every ref an assistant may rewrite: headline, summary, and bullets in plain lists. */
export function assistantEditableRefs(facts: EditFacts): string[] {
  return [
    'H',
    'S',
    ...facts.experiences
      .filter((item) => item.editable)
      .flatMap((item) => item.bullets.map((bullet) => bullet.ref)),
  ];
}

export function groundAssistantEdits(
  facts: EditFacts,
  input: AssistantEditInput
): AssistantEditResult {
  const grounded = groundEdits(
    { changes: input.changes },
    {
      facts,
      editableRefs: assistantEditableRefs(facts),
      jobDescription: input.jobDescription,
      instructions: input.instructions,
    }
  );
  return {
    changes: grounded.changes,
    dropped: grounded.dropped,
    ignored: input.changes.length - grounded.changes.length - grounded.dropped,
  };
}
