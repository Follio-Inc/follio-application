/**
 * Keeping the Builder's draft and an applied AI suggestion from fighting.
 *
 * The problem, stated precisely, because the shape of it decides the fix.
 *
 * The Builder is not autosaved. `AllSectionsEditor` holds a zustand draft and
 * writes it only when the user presses Save, which PATCHes `/api/profile`
 * with the profile-level fields *as a whole object* — including `summary`.
 * (`builder-client.tsx` does contain a debounced autosave, but nothing
 * imports it; the live surface is layout → BuilderLayoutClient →
 * AllSectionsEditor.) Experience bullets and project highlights are not in
 * that payload at all: they are written per entry by their own inline forms.
 *
 * So there is exactly one way an applied suggestion gets silently lost:
 *
 *   1. the user edits the summary in the Builder but does not save;
 *   2. they apply a summary rewrite, which the server writes;
 *   3. they press Save, and the draft they were holding overwrites it.
 *
 * …and one narrower way for the list sections: an inline entry form is open
 * with the old bullets loaded, and saving that form writes them back.
 *
 * `router.refresh()` does not fix either. `BuilderStoreProvider` adopts a
 * freshly fetched profile *only when the draft has no changes* — precisely
 * the case where there is nothing to lose. In the dangerous case it correctly
 * declines to clobber the user's edits, and the applied text never reaches
 * the store.
 *
 * What this module does instead, using primitives the store already has:
 *
 *   - `evaluateApplyGate` refuses to start an apply while a save is in
 *     flight, while an inline form is open, or while the draft holds an
 *     unsaved edit to the very field the suggestion targets. The third is the
 *     only genuine conflict, and it is handed back to the user to resolve
 *     rather than silently resolved for them.
 *   - `patchForAppliedProposal` turns the applied proposal into a
 *     `Partial<FullProfile>` for `commitInlineChange`, which writes both the
 *     draft *and* the saved baseline. After that a later Save sends the new
 *     text, because the draft now holds it.
 *
 * Unrelated unsaved edits survive, because the patch touches only the one
 * field the proposal addressed.
 *
 * Pure on purpose: no React, no store, no fetch. This file holds the decisions
 * and is tested directly; the component does the wiring.
 */

import type { ProposalView } from '@/lib/resume-proposals/client';
import type { FullProfile } from '@/types';

// ============================================================================
// THE GATE
// ============================================================================

/** What the gate needs to know. Read from the store by the caller. */
export interface ApplyGateState {
  /** `BuilderState.isSaving` — a profile save is in flight. */
  isSaving: boolean;
  /** `BuilderState.isInlineEditing` — an entry form is open. */
  isInlineEditing: boolean;
  /** What the user is editing right now. */
  draftProfile: FullProfile;
  /** What the server last confirmed. */
  savedProfile: FullProfile;
}

export type ApplyGate =
  | { ok: true }
  | { ok: false; code: 'saving' | 'inline-editing' | 'conflicting-edit'; reason: string };

/** Whether the draft holds an unsaved change to the field a proposal targets. */
export function hasConflictingDraftEdit(
  proposal: Pick<ProposalView, 'section' | 'fieldName' | 'targetRecordId' | 'arrayIndex'>,
  draft: FullProfile,
  saved: FullProfile
): boolean {
  if (proposal.section === 'summary') {
    return (draft.summary ?? '') !== (saved.summary ?? '');
  }

  if (proposal.section === 'experience') {
    const draftRow = draft.workExperiences?.find((row) => row.id === proposal.targetRecordId);
    const savedRow = saved.workExperiences?.find((row) => row.id === proposal.targetRecordId);
    // A row that is not in the draft cannot be conflicting — it is either
    // gone, which the server will report as stale, or never loaded.
    if (!draftRow || !savedRow) return false;
    return bulletsDiffer(draftRow.bullets, savedRow.bullets, proposal.arrayIndex);
  }

  if (proposal.section === 'project') {
    const draftRow = draft.projects?.find((row) => row.id === proposal.targetRecordId);
    const savedRow = saved.projects?.find((row) => row.id === proposal.targetRecordId);
    if (!draftRow || !savedRow) return false;
    if (proposal.fieldName === 'description') {
      return (draftRow.description ?? '') !== (savedRow.description ?? '');
    }
    return bulletsDiffer(draftRow.highlights, savedRow.highlights, proposal.arrayIndex);
  }

  return false;
}

function bulletsDiffer(
  draft: string[] | null | undefined,
  saved: string[] | null | undefined,
  index: number | null
): boolean {
  const draftList = draft ?? [];
  const savedList = saved ?? [];
  if (index === null) return draftList.join('\u0000') !== savedList.join('\u0000');
  // A reorder or an insertion moves the target, so a length change counts as
  // a conflict even when the text at the index happens to match.
  if (draftList.length !== savedList.length) return true;
  return draftList[index] !== savedList[index];
}

/**
 * May an apply start right now?
 *
 * Refusing is cheap and reversible; a lost edit is neither. Each refusal names
 * what the user has to do, because "try again later" on a button that looks
 * enabled is worse than a disabled button.
 */
export function evaluateApplyGate(state: ApplyGateState, proposal: ProposalView): ApplyGate {
  if (state.isSaving) {
    return {
      ok: false,
      code: 'saving',
      reason: 'Your resume is saving. Wait for that to finish, then apply this suggestion.',
    };
  }

  if (state.isInlineEditing) {
    return {
      ok: false,
      code: 'inline-editing',
      reason:
        'You have a section open for editing. Save or cancel it first — otherwise saving that ' +
        'form afterwards would write your older text back over this suggestion.',
    };
  }

  if (hasConflictingDraftEdit(proposal, state.draftProfile, state.savedProfile)) {
    return {
      ok: false,
      code: 'conflicting-edit',
      reason:
        'You have unsaved changes to this exact part of your resume. Save or discard them first, ' +
        'so it is clear which version you meant to keep.',
    };
  }

  return { ok: true };
}

// ============================================================================
// THE PATCH
// ============================================================================

/**
 * The store update that makes an applied suggestion stick.
 *
 * Returns a `Partial<FullProfile>` for `commitInlineChange`, which writes it
 * to the draft *and* the saved baseline. Both matter: the draft is what the
 * editor and preview render, and the baseline is what change-detection
 * compares against — if only the draft moved, the next Save would think the
 * field was edited and send it again, and `BuilderStoreProvider` would refuse
 * to adopt a refreshed server profile.
 *
 * Returns null when the proposal does not address anything in the loaded
 * profile. The caller then falls back to a refresh rather than guessing.
 */
export function patchForAppliedProposal(
  profile: FullProfile,
  proposal: ProposalView
): Partial<FullProfile> | null {
  const text = proposal.proposedText;

  if (proposal.section === 'summary' && proposal.fieldName === 'summary') {
    return { summary: text };
  }

  if (proposal.section === 'experience' && proposal.fieldName === 'bullets') {
    const rows = profile.workExperiences ?? [];
    const index = rows.findIndex((row) => row.id === proposal.targetRecordId);
    if (index === -1 || proposal.arrayIndex === null) return null;

    const row = rows[index];
    const bullets = [...(row.bullets ?? [])];
    if (proposal.arrayIndex >= bullets.length) return null;
    bullets[proposal.arrayIndex] = text;

    const next = [...rows];
    next[index] = { ...row, bullets };
    return { workExperiences: next };
  }

  if (proposal.section === 'project') {
    const rows = profile.projects ?? [];
    const index = rows.findIndex((row) => row.id === proposal.targetRecordId);
    if (index === -1) return null;

    const row = rows[index];
    const next = [...rows];

    if (proposal.fieldName === 'description') {
      next[index] = { ...row, description: text };
      return { projects: next };
    }

    if (proposal.fieldName === 'highlights' && proposal.arrayIndex !== null) {
      const highlights = [...(row.highlights ?? [])];
      if (proposal.arrayIndex >= highlights.length) return null;
      highlights[proposal.arrayIndex] = text;
      next[index] = { ...row, highlights };
      return { projects: next };
    }
  }

  return null;
}

/**
 * Where a proposal points, named from the resume the Builder has loaded.
 *
 * The server sends a label built from stored strings; this one can say
 * "Senior Engineer at Acme" because it has the row. Falls back to the
 * server's label when the row is gone, which is itself informative.
 */
export function describeProposalLocation(
  profile: FullProfile,
  proposal: Pick<ProposalView, 'section' | 'fieldName' | 'targetRecordId' | 'arrayIndex' | 'label'>
): string {
  const position = proposal.arrayIndex === null ? '' : ` — item ${proposal.arrayIndex + 1}`;

  if (proposal.section === 'summary') return 'Professional summary';

  if (proposal.section === 'experience') {
    const row = profile.workExperiences?.find((item) => item.id === proposal.targetRecordId);
    if (!row) return proposal.label;
    const where = [row.role, row.company].filter(Boolean).join(' at ');
    return `${where || 'Work experience'}${position}`;
  }

  if (proposal.section === 'project') {
    const row = profile.projects?.find((item) => item.id === proposal.targetRecordId);
    if (!row) return proposal.label;
    const field = proposal.fieldName === 'description' ? ' — description' : position;
    return `${row.title || 'Project'}${field}`;
  }

  return proposal.label;
}
