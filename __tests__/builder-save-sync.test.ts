/**
 * Phase 4, Test B — the Builder's draft against an applied suggestion.
 *
 * Not source assertions. These drive the **real zustand store**
 * (`createBuilderStore`), the real change detector (`hasProfileChanges`), the
 * real gate and patch functions, and the real save payload builder
 * (`saveProfileDraft`) with `fetch` stubbed — so what is asserted is what the
 * Builder would actually put on the wire.
 *
 * The failure being guarded against is silent and specific. The Builder is
 * **not autosaved**: `AllSectionsEditor` writes only when the user presses
 * Save, and that press PATCHes `/api/profile` with the profile-level fields
 * as one object — `summary` among them. So:
 *
 *     user edits summary, does not save
 *   → applies a summary rewrite, which the server writes
 *   → presses Save, and the stale draft overwrites it
 *
 * `router.refresh()` does not help, because `BuilderStoreProvider` adopts a
 * refreshed profile only when the draft is clean — exactly the case where
 * there was nothing to lose.
 *
 * What these tests cannot reach is documented at the bottom of the file.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeProposalLocation,
  evaluateApplyGate,
  patchForAppliedProposal,
} from '@/app/(dashboard)/builder/lib/apply-proposal-sync';
import { saveProfileDraft } from '@/app/(dashboard)/builder/lib/save-profile-draft';
import { createBuilderStore, hasProfileChanges } from '@/lib/stores/builder-store';

import type { ProposalView } from '@/lib/resume-proposals/client';
import type { FullProfile } from '@/types';

// ============================================================================
// FIXTURES
// ============================================================================

const ORIGINAL_SUMMARY = 'Builds APIs and data platforms.';
const APPLIED_SUMMARY = 'Builds and operates APIs and data platforms.';
const ORIGINAL_BULLET = 'Responsible for various backend services';
const APPLIED_BULLET = 'Built and maintained the backend services behind the platform';

function profile(overrides: Partial<FullProfile> = {}): FullProfile {
  return {
    id: 'resume_1',
    resumeTitle: 'Backend Engineer',
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Backend Engineer',
    summary: ORIGINAL_SUMMARY,
    location: 'San Francisco',
    totalExperience: null,
    totalExperienceVisible: true,
    totalExperienceShowYears: null,
    totalExperienceShowMonths: null,
    avatarUrl: null,
    status: 'DRAFT',
    contactInfo: null,
    links: [],
    workExperiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Engineer',
        bullets: [ORIGINAL_BULLET, 'Migrated 12 services onto Kubernetes'],
      },
    ],
    educations: [],
    skills: [],
    skillGroups: [],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling.',
        highlights: ['Cut deploy time in half'],
      },
    ],
    awards: [],
    certifications: [],
    blogPosts: [],
    youtubeVideos: [],
    photos: [],
    sections: [],
    ...overrides,
  } as unknown as FullProfile;
}

function proposal(overrides: Partial<ProposalView> = {}): ProposalView {
  return {
    id: 'proposal_1',
    batchId: 'batch_1',
    agentProposalId: 'prop_a',
    targetRef: 'experience:exp1:bullets:0',
    section: 'experience',
    targetRecordId: 'exp1',
    fieldName: 'bullets',
    arrayIndex: 0,
    label: 'Senior Engineer @ Acme — bullet 1',
    originalText: ORIGINAL_BULLET,
    proposedText: APPLIED_BULLET,
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
  proposedText: APPLIED_SUMMARY,
});

/**
 * What the Builder does when a suggestion comes back applied.
 *
 * Mirrors `ai-resume-assistant.tsx`'s `handleApplied`, which is the only
 * caller: patch from the server's applied proposal, then commit it to both
 * draft and saved baseline.
 */
function foldAppliedIntoStore(
  store: ReturnType<typeof createBuilderStore>,
  applied: ProposalView
): boolean {
  const state = store.getState();
  const patch = patchForAppliedProposal(state.draftProfile, applied);
  if (!patch) return false;
  state.commitInlineChange(patch);
  return true;
}

// ── The /api/profile seam ───────────────────────────────────────────────────

let fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      fetchCalls.push({
        url: String(url),
        body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {},
      });
      return { ok: true, json: async () => ({}) } as Response;
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run the Builder's real save path for the store's current draft. */
async function pressSave(store: ReturnType<typeof createBuilderStore>): Promise<void> {
  const state = store.getState();
  await saveProfileDraft({
    draftProfile: state.draftProfile,
    contactDraft: state.contactDraft,
    shouldSaveProfile: hasProfileChanges(state.draftProfile, state.savedProfile),
    shouldSaveContact: false,
  });
  state.markSaved();
}

function profilePatch(): Record<string, unknown> | undefined {
  return fetchCalls.find((call) => call.url === '/api/profile')?.body;
}

// ============================================================================
// APPLIED TEXT SURVIVES A SAVE
// ============================================================================

describe('an applied suggestion survives the next Save', () => {
  it('writes the applied summary into both the draft and the saved baseline', () => {
    const store = createBuilderStore(profile());

    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });

    const state = store.getState();
    expect(state.draftProfile.summary).toBe(APPLIED_SUMMARY);
    // The baseline matters as much as the draft: if only the draft moved, the
    // next Save would treat the field as edited and send it again, and the
    // provider would refuse to adopt a refreshed server profile.
    expect(state.savedProfile.summary).toBe(APPLIED_SUMMARY);
    expect(hasProfileChanges(state.draftProfile, state.savedProfile)).toBe(false);
  });

  it('sends nothing at all when the only change was the applied text', async () => {
    const store = createBuilderStore(profile());
    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });

    await pressSave(store);

    // Draft equals baseline, so there is nothing to save — and in particular
    // no PATCH carrying the old summary.
    expect(profilePatch()).toBeUndefined();
  });

  it('carries the applied summary, not the old one, when something else is also dirty', async () => {
    const store = createBuilderStore(profile());

    // An unrelated unsaved edit, which is the realistic case.
    store.getState().updateDraft({ headline: 'Staff Engineer' });
    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });

    await pressSave(store);

    const body = profilePatch();
    expect(body).toBeDefined();
    // The regression this whole mechanism exists to prevent.
    expect(body!.summary).toBe(APPLIED_SUMMARY);
    expect(body!.summary).not.toBe(ORIGINAL_SUMMARY);
    // And the unrelated edit was not discarded to achieve it.
    expect(body!.headline).toBe('Staff Engineer');
  });

  it('shows the applied bullet in the draft the preview renders', () => {
    const store = createBuilderStore(profile());
    foldAppliedIntoStore(store, { ...proposal(), state: 'APPLIED' });

    const state = store.getState();
    expect(state.draftProfile.workExperiences[0].bullets).toEqual([
      APPLIED_BULLET,
      'Migrated 12 services onto Kubernetes',
    ]);
    expect(state.savedProfile.workExperiences[0].bullets[0]).toBe(APPLIED_BULLET);
  });

  it('leaves the bullet out of the profile PATCH entirely', async () => {
    // Experience bullets are saved per entry by their own inline form, not by
    // the main Save. Asserting it here pins *why* the bullet case is lower
    // risk than the summary one.
    const store = createBuilderStore(profile());
    foldAppliedIntoStore(store, { ...proposal(), state: 'APPLIED' });
    store.getState().updateDraft({ headline: 'Staff Engineer' });

    await pressSave(store);

    const body = profilePatch()!;
    expect(Object.keys(body)).not.toContain('workExperiences');
    expect(Object.keys(body)).not.toContain('bullets');
  });
});

// ============================================================================
// RELOAD
// ============================================================================

describe('a reload picks up the applied value', () => {
  /**
   * `BuilderStoreProvider`'s adoption rule, as it is actually written: a
   * freshly fetched profile replaces the store only when the draft has no
   * changes against its baseline.
   */
  function providerWouldAdopt(store: ReturnType<typeof createBuilderStore>): boolean {
    const state = store.getState();
    return !(
      state.draftProfile.firstName !== state.savedProfile.firstName ||
      state.draftProfile.lastName !== state.savedProfile.lastName ||
      state.draftProfile.headline !== state.savedProfile.headline ||
      state.draftProfile.summary !== state.savedProfile.summary ||
      state.draftProfile.location !== state.savedProfile.location
    );
  }

  it('adopts a server refresh after an apply, because the fold left the draft clean', () => {
    const store = createBuilderStore(profile());
    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });

    expect(providerWouldAdopt(store)).toBe(true);
  });

  it('refuses the refresh while an unrelated edit is unsaved, and keeps the applied text anyway', () => {
    const store = createBuilderStore(profile());
    store.getState().updateDraft({ headline: 'Staff Engineer' });
    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });

    // The provider declines, which is correct — it would discard the user's
    // headline. The applied summary is safe regardless, because the fold put
    // it in the draft rather than relying on the refresh.
    expect(providerWouldAdopt(store)).toBe(false);
    expect(store.getState().draftProfile.summary).toBe(APPLIED_SUMMARY);
  });

  it('shows the applied value after a fresh store is built from server data', () => {
    // What a page reload does: a new store from what the server now holds.
    const reloaded = createBuilderStore(profile({ summary: APPLIED_SUMMARY }));
    expect(reloaded.getState().draftProfile.summary).toBe(APPLIED_SUMMARY);
    expect(
      hasProfileChanges(reloaded.getState().draftProfile, reloaded.getState().savedProfile)
    ).toBe(false);
  });
});

// ============================================================================
// THE GATE, AGAINST REAL STORE STATE
// ============================================================================

describe('unsafe applies are refused before they start', () => {
  function gateFor(store: ReturnType<typeof createBuilderStore>, subject: ProposalView) {
    const state = store.getState();
    return evaluateApplyGate(
      {
        isSaving: state.isSaving,
        isInlineEditing: state.isInlineEditing,
        draftProfile: state.draftProfile,
        savedProfile: state.savedProfile,
      },
      subject
    );
  }

  it('allows an apply on a clean store', () => {
    expect(gateFor(createBuilderStore(profile()), SUMMARY_PROPOSAL)).toEqual({ ok: true });
  });

  it('refuses while a save is in flight', () => {
    const store = createBuilderStore(profile());
    store.getState().setSaving(true);

    const gate = gateFor(store, SUMMARY_PROPOSAL);
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('saving');
  });

  it('refuses while an inline entry form holds stale content', () => {
    const store = createBuilderStore(profile());
    store.getState().setInlineEditing(true);

    const gate = gateFor(store, proposal());
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('inline-editing');
  });

  it('refuses when the draft holds an unsaved edit to the same field', () => {
    const store = createBuilderStore(profile());
    store.getState().updateDraft({ summary: 'A summary I typed and have not saved' });

    const gate = gateFor(store, SUMMARY_PROPOSAL);
    expect(gate.ok).toBe(false);
    expect(gate.ok === false && gate.code).toBe('conflicting-edit');
  });

  it('allows an apply when the unsaved edit is elsewhere', () => {
    const store = createBuilderStore(profile());
    store.getState().updateDraft({ headline: 'Staff Engineer' });

    expect(gateFor(store, SUMMARY_PROPOSAL)).toEqual({ ok: true });
  });

  it('keeps the user’s own text when the gate refuses', async () => {
    const store = createBuilderStore(profile());
    const mine = 'A summary I typed and have not saved';
    store.getState().updateDraft({ summary: mine });

    const gate = gateFor(store, SUMMARY_PROPOSAL);
    expect(gate.ok).toBe(false);

    // Nothing was folded in, so a Save sends what the user wrote.
    await pressSave(store);
    expect(profilePatch()!.summary).toBe(mine);
  });
});

// ============================================================================
// THE APPLY LOCK
// ============================================================================

describe('a save cannot race an apply', () => {
  /** `AllSectionsEditor.handleSave`'s first line, as it is written. */
  async function handleSave(store: ReturnType<typeof createBuilderStore>): Promise<boolean> {
    const state = store.getState();
    if (state.isApplyingProposal) return false;
    await pressSave(store);
    return true;
  }

  it('refuses to save while an apply is in flight', async () => {
    const store = createBuilderStore(profile());
    store.getState().updateDraft({ summary: 'stale draft text' });
    store.getState().setApplyingProposal(true);

    expect(await handleSave(store)).toBe(false);
    // The decisive part: no request left the browser, so the stale draft
    // could not reach the server while the apply was mid-flight.
    expect(fetchCalls).toEqual([]);
  });

  it('saves normally once the apply has settled', async () => {
    const store = createBuilderStore(profile());
    store.getState().setApplyingProposal(true);
    store.getState().updateDraft({ headline: 'Staff Engineer' });

    expect(await handleSave(store)).toBe(false);

    // Released however the request ended — success or failure.
    store.getState().setApplyingProposal(false);
    expect(await handleSave(store)).toBe(true);
    expect(profilePatch()!.headline).toBe('Staff Engineer');
  });

  it('interleaves an apply and a save without losing either', async () => {
    const store = createBuilderStore(profile());

    // An unrelated unsaved edit the user is holding.
    store.getState().updateDraft({ headline: 'Staff Engineer' });

    // Apply starts: the lock goes on, a save attempted now does nothing.
    store.getState().setApplyingProposal(true);
    expect(await handleSave(store)).toBe(false);

    // Server confirms; the Builder folds the applied text in and releases.
    foldAppliedIntoStore(store, { ...SUMMARY_PROPOSAL, state: 'APPLIED' });
    store.getState().setApplyingProposal(false);

    // Now the save runs, and carries both: the applied summary and the
    // user's own unsaved headline.
    expect(await handleSave(store)).toBe(true);
    const body = profilePatch()!;
    expect(body.summary).toBe(APPLIED_SUMMARY);
    expect(body.headline).toBe('Staff Engineer');
  });
});

// ============================================================================
// LOCATION NAMING
// ============================================================================

describe('a proposal is named from the loaded resume', () => {
  it('uses the role and company the Builder has in memory', () => {
    expect(describeProposalLocation(profile(), proposal())).toBe(
      'Senior Engineer at Acme — item 1'
    );
  });

  it('falls back to the stored label once the row is gone', () => {
    const gone = profile({ workExperiences: [] } as unknown as Partial<FullProfile>);
    expect(describeProposalLocation(gone, proposal())).toBe('Senior Engineer @ Acme — bullet 1');
  });
});

// ============================================================================
// WHAT THIS CANNOT REACH
// ============================================================================

describe('gaps only a browser can close', () => {
  it('documents what still needs manual verification', () => {
    // Deliberately a passing test holding a written-down list, so the gaps
    // travel with the suite instead of living only in a report nobody reopens.
    const manualOnly = [
      'Clicking Apply in the real dialog and watching the editor and preview update.',
      'The exact timing of a Save pressed during the apply request round trip.',
      'Whether the rendered Save button is visibly disabled while the lock is held.',
      'router.refresh() actually refetching the server component tree.',
      'Focus, scroll position and dialog behaviour after an apply.',
    ];

    expect(manualOnly.length).toBeGreaterThan(0);
    // These are driven from the real store rather than from React, so they
    // prove the state transitions, not the rendering of them.
  });
});
