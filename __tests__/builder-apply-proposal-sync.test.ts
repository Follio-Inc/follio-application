/**
 * Phase 3B.2 — keeping the Builder draft and an applied suggestion apart.
 *
 * This is the file that matters most in 3B.2, because the failure it guards
 * against is silent: the server writes the suggestion correctly, the user
 * presses Save a moment later, and their older draft overwrites it with no
 * error anywhere.
 *
 * The rules are pure functions precisely so they can be tested here rather
 * than asserted about in prose. Each case below is a real draft/saved pair
 * run through the real gate and the real patch builder.
 *
 * Also exercised, against the shipped source, are the two wiring facts the
 * pure functions cannot cover: that the Builder's save handler refuses while
 * an apply is in flight, and that the lock is released however the request
 * ends.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describeProposalLocation,
  evaluateApplyGate,
  hasConflictingDraftEdit,
  patchForAppliedProposal,
} from '@/app/(dashboard)/builder/lib/apply-proposal-sync';

import type { ProposalView } from '@/lib/resume-proposals/client';
import type { FullProfile } from '@/types';

const ROOT = process.cwd();
const readSource = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

// ============================================================================
// FIXTURES
// ============================================================================

const ORIGINAL_BULLET = 'Responsible for various backend services';
const NEW_BULLET = 'Built and maintained the backend services behind the platform';
const ORIGINAL_SUMMARY = 'Builds APIs and data platforms.';

function profile(overrides: Partial<FullProfile> = {}): FullProfile {
  return {
    id: 'resume_1',
    resumeTitle: 'Backend Engineer',
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Backend Engineer',
    summary: ORIGINAL_SUMMARY,
    location: 'San Francisco',
    workExperiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Engineer',
        bullets: [ORIGINAL_BULLET, 'Migrated 12 services onto Kubernetes'],
      },
      { id: 'exp2', company: 'Globex', role: 'Engineer', bullets: ['Shipped the billing API'] },
    ],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling.',
        highlights: ['Cut deploy time in half', 'Added a rollback path'],
      },
    ],
    ...overrides,
  } as unknown as FullProfile;
}

function proposal(overrides: Partial<ProposalView> = {}): ProposalView {
  return {
    id: 'proposal_1',
    batchId: 'batch_1',
    agentProposalId: 'prop_experience_exp1_bullets_0',
    targetRef: 'experience:exp1:bullets:0',
    section: 'experience',
    targetRecordId: 'exp1',
    fieldName: 'bullets',
    arrayIndex: 0,
    label: 'Senior Engineer @ Acme — bullet 1',
    originalText: ORIGINAL_BULLET,
    proposedText: NEW_BULLET,
    explanation: '',
    sourceEvidence: [],
    keywordsAddressed: [],
    uncertainties: [],
    verificationStatus: 'APPROVED',
    verificationReason: '',
    deterministicIssues: [],
    revisionRound: 0,
    decision: 'APPROVED',
    state: 'APPROVED',
    stateReason: null,
    stale: false,
    staleDetail: null,
    applicable: true,
    createdAt: '2026-11-26T10:00:00.000Z',
    decidedAt: null,
    appliedAt: null,
    ...overrides,
  };
}

const SUMMARY_PROPOSAL = proposal({
  targetRef: 'summary:profile:summary',
  section: 'summary',
  targetRecordId: 'profile',
  fieldName: 'summary',
  arrayIndex: null,
  originalText: ORIGINAL_SUMMARY,
  proposedText: 'Builds and operates APIs and data platforms.',
});

const HIGHLIGHT_PROPOSAL = proposal({
  targetRef: 'project:proj1:highlights:1',
  section: 'project',
  targetRecordId: 'proj1',
  fieldName: 'highlights',
  arrayIndex: 1,
  originalText: 'Added a rollback path',
  proposedText: 'Added a one-command rollback path',
});

function gateState(draft: FullProfile, saved: FullProfile = profile()) {
  return { isSaving: false, isInlineEditing: false, draftProfile: draft, savedProfile: saved };
}

// ============================================================================
// THE GATE
// ============================================================================

describe('an apply is refused while a save could lose it', () => {
  it('allows an apply when nothing is pending', () => {
    expect(evaluateApplyGate(gateState(profile()), proposal())).toEqual({ ok: true });
  });

  it('refuses while a profile save is in flight', () => {
    const gate = evaluateApplyGate({ ...gateState(profile()), isSaving: true }, SUMMARY_PROPOSAL);
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('saving');
    expect(gate.ok === false && gate.reason).toMatch(/saving/i);
  });

  it('refuses while an inline entry form is open', () => {
    // That form holds the old bullets and would write them back on save.
    const gate = evaluateApplyGate({ ...gateState(profile()), isInlineEditing: true }, proposal());
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('inline-editing');
  });

  it('refuses when the draft holds an unsaved edit to the very same field', () => {
    const draft = profile({ summary: 'A summary I typed myself and have not saved' });
    const gate = evaluateApplyGate(gateState(draft), SUMMARY_PROPOSAL);

    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('conflicting-edit');
    // Handed back to the user rather than resolved for them.
    expect(gate.ok === false && gate.reason).toMatch(/save or discard/i);
  });

  it('allows an apply when the unsaved edit is somewhere else entirely', () => {
    // Editing the headline must not block a summary suggestion.
    const draft = profile({ headline: 'Staff Engineer' });
    expect(evaluateApplyGate(gateState(draft), SUMMARY_PROPOSAL)).toEqual({ ok: true });
  });
});

describe('detecting a conflicting draft edit', () => {
  it('sees an edited summary', () => {
    expect(
      hasConflictingDraftEdit(SUMMARY_PROPOSAL, profile({ summary: 'changed' }), profile())
    ).toBe(true);
    expect(hasConflictingDraftEdit(SUMMARY_PROPOSAL, profile(), profile())).toBe(false);
  });

  it('sees an edited bullet at the targeted index', () => {
    const draft = profile({
      workExperiences: [
        {
          id: 'exp1',
          company: 'Acme',
          role: 'Senior Engineer',
          bullets: ['I rewrote this', 'Migrated 12 services onto Kubernetes'],
        },
        { id: 'exp2', company: 'Globex', role: 'Engineer', bullets: ['Shipped the billing API'] },
      ],
    } as unknown as Partial<FullProfile>);

    expect(hasConflictingDraftEdit(proposal(), draft, profile())).toBe(true);
  });

  it('ignores an edit to a different bullet of the same role', () => {
    const draft = profile({
      workExperiences: [
        {
          id: 'exp1',
          company: 'Acme',
          role: 'Senior Engineer',
          bullets: [ORIGINAL_BULLET, 'I rewrote the second one'],
        },
        { id: 'exp2', company: 'Globex', role: 'Engineer', bullets: ['Shipped the billing API'] },
      ],
    } as unknown as Partial<FullProfile>);

    expect(hasConflictingDraftEdit(proposal(), draft, profile())).toBe(false);
  });

  it('treats an added or removed bullet as a conflict even when the text matches', () => {
    // An insertion moves the target, so index 0 is no longer the same line.
    const draft = profile({
      workExperiences: [
        {
          id: 'exp1',
          company: 'Acme',
          role: 'Senior Engineer',
          bullets: ['A new first bullet', ORIGINAL_BULLET, 'Migrated 12 services onto Kubernetes'],
        },
        { id: 'exp2', company: 'Globex', role: 'Engineer', bullets: ['Shipped the billing API'] },
      ],
    } as unknown as Partial<FullProfile>);

    expect(hasConflictingDraftEdit(proposal(), draft, profile())).toBe(true);
  });

  it('ignores a row the draft no longer holds', () => {
    // The server will report that as stale; it is not a draft conflict.
    const draft = profile({ workExperiences: [] } as unknown as Partial<FullProfile>);
    expect(hasConflictingDraftEdit(proposal(), draft, profile())).toBe(false);
  });
});

// ============================================================================
// THE PATCH
// ============================================================================

describe('folding an applied suggestion into the draft', () => {
  it('replaces exactly the targeted bullet', () => {
    const subject = profile();
    const patch = patchForAppliedProposal(subject, proposal());
    expect(patch).not.toBeNull();

    const experiences = patch!.workExperiences!;
    expect(experiences[0].bullets).toEqual([NEW_BULLET, 'Migrated 12 services onto Kubernetes']);
    // The sibling role is carried through by reference, so nothing about it
    // can have been rewritten on the way past.
    expect(experiences[1]).toBe(subject.workExperiences![1]);
  });

  it('replaces the summary', () => {
    expect(patchForAppliedProposal(profile(), SUMMARY_PROPOSAL)).toEqual({
      summary: 'Builds and operates APIs and data platforms.',
    });
  });

  it('replaces a project highlight by index', () => {
    const patch = patchForAppliedProposal(profile(), HIGHLIGHT_PROPOSAL);
    expect(patch!.projects![0].highlights).toEqual([
      'Cut deploy time in half',
      'Added a one-command rollback path',
    ]);
  });

  it('replaces a project description', () => {
    const patch = patchForAppliedProposal(
      profile(),
      proposal({
        section: 'project',
        targetRecordId: 'proj1',
        fieldName: 'description',
        arrayIndex: null,
        proposedText: 'Deploy tooling for the research group.',
      })
    );
    expect(patch!.projects![0].description).toBe('Deploy tooling for the research group.');
  });

  it('touches only the one field the proposal addressed', () => {
    const patch = patchForAppliedProposal(profile(), proposal())!;
    // Unrelated unsaved work elsewhere cannot be clobbered by a patch that
    // does not mention it.
    expect(Object.keys(patch)).toEqual(['workExperiences']);
    expect(patch).not.toHaveProperty('summary');
    expect(patch).not.toHaveProperty('headline');
  });

  it('does not mutate the profile it was given', () => {
    const subject = profile();
    patchForAppliedProposal(subject, proposal());
    expect(subject.workExperiences![0].bullets[0]).toBe(ORIGINAL_BULLET);
  });

  it('returns null when the row has gone', () => {
    const gone = profile({ workExperiences: [] } as unknown as Partial<FullProfile>);
    expect(patchForAppliedProposal(gone, proposal())).toBeNull();
  });

  it('returns null when the index is past the end', () => {
    expect(patchForAppliedProposal(profile(), proposal({ arrayIndex: 9 }))).toBeNull();
    expect(patchForAppliedProposal(profile(), HIGHLIGHT_PROPOSAL)).not.toBeNull();
    expect(patchForAppliedProposal(profile(), { ...HIGHLIGHT_PROPOSAL, arrayIndex: 7 })).toBeNull();
  });
});

describe('naming where a suggestion applies', () => {
  it('uses the role and company from the loaded resume', () => {
    expect(describeProposalLocation(profile(), proposal())).toBe(
      'Senior Engineer at Acme — item 1'
    );
  });

  it('names the summary plainly', () => {
    expect(describeProposalLocation(profile(), SUMMARY_PROPOSAL)).toBe('Professional summary');
  });

  it('names a project highlight and a project description differently', () => {
    expect(describeProposalLocation(profile(), HIGHLIGHT_PROPOSAL)).toBe('Ops Platform — item 2');
    expect(
      describeProposalLocation(
        profile(),
        proposal({
          section: 'project',
          targetRecordId: 'proj1',
          fieldName: 'description',
          arrayIndex: null,
        })
      )
    ).toBe('Ops Platform — description');
  });

  it('falls back to the stored label when the row is gone', () => {
    const gone = profile({ workExperiences: [] } as unknown as Partial<FullProfile>);
    expect(describeProposalLocation(gone, proposal())).toBe('Senior Engineer @ Acme — bullet 1');
  });
});

// ============================================================================
// WIRING THE PURE RULES CANNOT COVER
// ============================================================================

const STORE_PATH = 'lib/stores/builder-store.ts';
const EDITOR_PATH = 'app/(dashboard)/builder/components/all-sections-editor.tsx';
const ASSISTANT_PATH = 'app/(dashboard)/builder/components/ai-resume-assistant.tsx';
const DIALOG_PATH = 'app/(dashboard)/builder/components/rewrite-proposals-dialog.tsx';

describe('the Builder refuses to save over an apply in flight', () => {
  it('carries an apply lock in the store', () => {
    const source = readSource(STORE_PATH);
    expect(source).toContain('isApplyingProposal: boolean');
    expect(source).toContain('setApplyingProposal');
  });

  it('returns early from the save handler while that lock is held', () => {
    const source = readSource(EDITOR_PATH);
    // The guard sits before setSaving, so no request is started at all.
    const guardIndex = source.indexOf('if (isApplyingProposal) return false;');
    const savingIndex = source.indexOf('setSaving(true);');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(savingIndex);
  });

  it('releases the lock however the request ends', () => {
    const source = readSource(DIALOG_PATH);
    // A lock released only on success would disable Save permanently after
    // one failed apply, so it has to live in the finally block.
    const finallyIndex = source.indexOf('onApplyingChange?.(false);');
    expect(finallyIndex).toBeGreaterThan(-1);
    expect(source.slice(finallyIndex - 200, finallyIndex)).toContain('} finally {');
  });

  it('writes an applied value to both the draft and the saved baseline', () => {
    // `commitInlineChange` is the store action that updates both. A
    // draft-only write would look like an unsaved edit on the next save.
    expect(readSource(ASSISTANT_PATH)).toContain('commitInlineChange(patch)');
    expect(readSource(STORE_PATH)).toContain('commitInlineChange');
  });

  it('does not rely on router.refresh alone', () => {
    const source = readSource(ASSISTANT_PATH);
    const refreshIndex = source.indexOf('router.refresh()');
    const patchIndex = source.indexOf('patchForAppliedProposal');
    expect(patchIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(patchIndex);
  });
});
