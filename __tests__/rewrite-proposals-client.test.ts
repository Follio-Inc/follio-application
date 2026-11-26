/**
 * Phase 3B.2 — the client contract for rewrite proposals.
 *
 * This repository has no DOM test environment (the `.tsx` suites render with
 * `renderToStaticMarkup`), so the useful thing to do is keep the decisions
 * out of the component and test them here, directly. Every rule that controls
 * what a user may do to their resume lives in `lib/resume-proposals/client.ts`
 * and is exercised below against real state objects rather than asserted
 * against source text.
 *
 * The rule that matters most and is tested hardest: the client offers Apply
 * only when the *server* said the proposal is applicable. It may ask for less
 * than the backend would allow; it must never ask for more.
 */

import { describe, expect, it } from 'vitest';

import {
  applyBlockedReason,
  buildGenerateRequest,
  canApply,
  canApprove,
  canReject,
  createIdempotencyKey,
  failureMessage,
  proposalLocation,
  proposalPaths,
  readApiFailure,
  recountBatch,
  replaceProposal,
  sortForReview,
  statusBadge,
  verificationSummary,
  type BatchView,
  type DecisionName,
  type ProposalStateName,
  type ProposalView,
  type VerificationStatusName,
} from '@/lib/resume-proposals/client';

// ============================================================================
// FIXTURES
// ============================================================================

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
    label: 'Backend Engineer @ Acme — bullet 1',
    originalText: 'Responsible for various backend services',
    proposedText: 'Built and maintained the backend services behind the platform',
    explanation: 'Replaces filler with a concrete action verb.',
    sourceEvidence: ['Responsible for various backend services'],
    keywordsAddressed: [],
    uncertainties: [],
    verificationStatus: 'APPROVED',
    verificationReason: 'Preserves every fact.',
    deterministicIssues: [],
    revisionRound: 0,
    decision: 'NONE',
    state: 'PENDING_REVIEW',
    stateReason: null,
    stale: false,
    staleDetail: null,
    applicable: false,
    createdAt: '2026-11-26T10:00:00.000Z',
    decidedAt: null,
    appliedAt: null,
    ...overrides,
  };
}

function batch(overrides: Partial<BatchView> = {}): BatchView {
  return {
    id: 'batch_1',
    resumeId: 'resume_1',
    mode: 'general',
    status: 'COMPLETE',
    rootRunId: 'run_1',
    summary: 'Evaluated and proposed edits.',
    openQuestions: [],
    limitations: [],
    revisionAttempts: 0,
    counts: {
      total: 0,
      pendingReview: 0,
      approved: 0,
      rejected: 0,
      applied: 0,
      unavailable: 0,
      stale: 0,
    },
    createdAt: '2026-11-26T10:00:00.000Z',
    updatedAt: '2026-11-26T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// REQUESTS
// ============================================================================

describe('the generate request matches the route’s strict schema', () => {
  it('sends only mode and the key for a general run', () => {
    expect(buildGenerateRequest({ mode: 'general', idempotencyKey: 'k1' })).toEqual({
      mode: 'general',
      idempotencyKey: 'k1',
    });
  });

  it('sends the job description only in jd mode', () => {
    expect(
      buildGenerateRequest({ mode: 'jd', jobDescription: 'Senior…', idempotencyKey: 'k1' })
    ).toEqual({ mode: 'jd', jobDescription: 'Senior…', idempotencyKey: 'k1' });

    // The route rejects a jobDescription sent without jd mode, so the builder
    // must drop a value the user typed and then switched away from.
    expect(
      buildGenerateRequest({
        mode: 'general',
        jobDescription: 'left over from the other tab',
        targetRole: 'software-engineer',
        idempotencyKey: 'k1',
      })
    ).toEqual({ mode: 'general', idempotencyKey: 'k1' });
  });

  it('sends the target role only in role mode', () => {
    expect(
      buildGenerateRequest({ mode: 'role', targetRole: 'data-scientist', idempotencyKey: 'k1' })
    ).toEqual({ mode: 'role', targetRole: 'data-scientist', idempotencyKey: 'k1' });
  });

  it('never sends a field that would let a client claim verification', () => {
    const body = buildGenerateRequest({
      mode: 'jd',
      jobDescription: 'x',
      idempotencyKey: 'k1',
    });
    for (const forbidden of ['verified', 'verificationStatus', 'state', 'decision', 'userId']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('mints distinct idempotency keys per call', () => {
    const first = createIdempotencyKey();
    const second = createIdempotencyKey();
    expect(first).not.toBe(second);
    expect(first.startsWith('rewrite-')).toBe(true);
    // Long enough for the route's `min(8)` check.
    expect(first.length).toBeGreaterThanOrEqual(8);
  });
});

describe('endpoint paths match the shipped routes', () => {
  it('builds each path from ids only', () => {
    expect(proposalPaths.collection('r1')).toBe('/api/resumes/r1/rewrite-proposals');
    expect(proposalPaths.batch('r1', 'b1')).toBe('/api/resumes/r1/rewrite-proposals/b1');
    expect(proposalPaths.proposal('r1', 'b1', 'p1')).toBe(
      '/api/resumes/r1/rewrite-proposals/b1/proposals/p1'
    );
    expect(proposalPaths.decision('r1', 'b1', 'p1')).toBe(
      '/api/resumes/r1/rewrite-proposals/b1/proposals/p1/decision'
    );
    expect(proposalPaths.apply('r1', 'b1', 'p1')).toBe(
      '/api/resumes/r1/rewrite-proposals/b1/proposals/p1/apply'
    );
  });
});

// ============================================================================
// ERRORS
// ============================================================================

describe('reading a failure', () => {
  it('reads the structured conflict the apply path returns', () => {
    const failure = readApiFailure(409, {
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Your resume changed after this suggestion was written.',
        details: { state: 'STALE', stale: true },
      },
    });

    expect(failure.isConflict).toBe(true);
    expect(failure.state).toBe('STALE');
    expect(failure.stale).toBe(true);
    expect(failure.message).toMatch(/resume changed/i);
  });

  it('reads the plain shape the routes’ own guards return', () => {
    const failure = readApiFailure(404, { error: 'Resume not found' });
    expect(failure.message).toBe('Resume not found');
    expect(failure.details).toBeNull();
    expect(failure.isConflict).toBe(false);
  });

  it('does not invent a state from an unknown string', () => {
    const failure = readApiFailure(409, {
      success: false,
      error: { code: 'CONFLICT', message: 'x', details: { state: 'SOMETHING_ELSE' } },
    });
    expect(failure.state).toBeNull();
  });

  it('survives an empty or unparseable body', () => {
    expect(readApiFailure(500, null).message).toMatch(/something went wrong/i);
    expect(readApiFailure(500, 'not json').state).toBeNull();
  });

  it('detects an already-applied conflict by its state, not its wording', () => {
    const failure = readApiFailure(409, {
      success: false,
      error: { code: 'CONFLICT', message: 'anything at all', details: { state: 'APPLIED' } },
    });
    expect(failure.state).toBe('APPLIED');
    expect(failure.stale).toBe(false);
  });

  it('phrases rate limiting without implying the resume changed', () => {
    const message = failureMessage(
      readApiFailure(429, { error: 'Too many analyses recently. Try again shortly.' })
    );
    expect(message).toMatch(/review suggestions you already have/i);
    expect(message).not.toMatch(/changed|applied/i);
  });

  it('does not leak ids or internals for an auth failure', () => {
    const message = failureMessage(readApiFailure(404, { error: 'Resume not found' }));
    expect(message).toMatch(/not available/i);
  });
});

// ============================================================================
// WHAT A PROPOSAL MAY DO
// ============================================================================

describe('apply is offered only when the server says so', () => {
  it('follows the server’s applicable flag rather than re-deriving it', () => {
    // Everything else reads like it should be applicable, but the server
    // said no — perhaps the target drifted. The client defers.
    expect(
      canApply(
        proposal({
          state: 'APPROVED',
          decision: 'APPROVED',
          verificationStatus: 'APPROVED',
          applicable: false,
        })
      )
    ).toBe(false);

    expect(canApply(proposal({ state: 'APPROVED', decision: 'APPROVED', applicable: true }))).toBe(
      true
    );
  });

  it('never offers apply for a proposal the verifier did not approve', () => {
    const statuses: VerificationStatusName[] = [
      'REVISION_REQUIRED',
      'REJECTED',
      'NEEDS_USER_INPUT',
      'UNVERIFIED',
    ];
    for (const verificationStatus of statuses) {
      // Even if a buggy server sent applicable:true, the buttons that let a
      // user *reach* applicable are closed off.
      expect(canApprove(proposal({ verificationStatus }))).toBe(false);
      expect(canReject(proposal({ verificationStatus }))).toBe(false);
    }
  });

  it('never offers apply for a pending proposal', () => {
    expect(canApply(proposal({ state: 'PENDING_REVIEW', applicable: false }))).toBe(false);
  });

  it('never offers apply twice', () => {
    expect(canApply(proposal({ state: 'APPLIED', applicable: false }))).toBe(false);
  });
});

describe('approve and reject availability', () => {
  const cases: Array<[ProposalStateName, DecisionName, boolean, boolean]> = [
    // state, decision, canApprove, canReject
    ['PENDING_REVIEW', 'NONE', true, true],
    ['APPROVED', 'APPROVED', false, true],
    ['REJECTED', 'REJECTED', true, false],
    ['APPLIED', 'APPROVED', false, false],
    ['STALE', 'APPROVED', false, false],
    ['UNAVAILABLE', 'NONE', false, false],
  ];

  it.each(cases)('%s / %s → approve %s, reject %s', (state, decision, approve, reject) => {
    const subject = proposal({ state, decision });
    expect(canApprove(subject)).toBe(approve);
    expect(canReject(subject)).toBe(reject);
  });

  it('lets a user change their mind after rejecting', () => {
    expect(canApprove(proposal({ state: 'REJECTED', decision: 'REJECTED' }))).toBe(true);
  });
});

describe('the interface separates AI verification from user approval', () => {
  it('says an approved verdict is still the user’s call', () => {
    const summary = verificationSummary(proposal({ verificationStatus: 'APPROVED' }));
    expect(summary.needsUserApproval).toBe(true);
    expect(summary.detail).toMatch(/not approval/i);
    expect(summary.detail).toMatch(/your call/i);
  });

  it('never claims a non-approved verdict needs only a click', () => {
    for (const status of [
      'REVISION_REQUIRED',
      'REJECTED',
      'NEEDS_USER_INPUT',
      'UNVERIFIED',
    ] as VerificationStatusName[]) {
      expect(verificationSummary(proposal({ verificationStatus: status })).needsUserApproval).toBe(
        false
      );
    }
  });

  it('prefers the verifier’s own reason when it gave one', () => {
    const summary = verificationSummary(
      proposal({
        verificationStatus: 'NEEDS_USER_INPUT',
        verificationReason: 'How many services were there?',
      })
    );
    expect(summary.detail).toBe('How many services were there?');
  });
});

describe('status chips report the lifecycle honestly', () => {
  it.each([
    ['PENDING_REVIEW', 'Needs your review', 'pending'],
    ['APPROVED', 'You approved this', 'approved'],
    ['REJECTED', 'You rejected this', 'rejected'],
    ['APPLIED', 'Applied', 'applied'],
    ['STALE', 'Out of date', 'blocked'],
    ['UNAVAILABLE', 'Not available', 'blocked'],
  ])('%s renders as %s', (state, label, tone) => {
    const badge = statusBadge(proposal({ state: state as ProposalStateName }));
    expect(badge.label).toBe(label);
    expect(badge.tone).toBe(tone);
  });

  it('shows an approved-but-drifted proposal as out of date, not ready', () => {
    const badge = statusBadge(proposal({ state: 'APPROVED', decision: 'APPROVED', stale: true }));
    expect(badge.label).toBe('Out of date');
    expect(badge.tone).toBe('blocked');
  });
});

describe('why apply is unavailable', () => {
  it('names the reason for each blocked case', () => {
    expect(applyBlockedReason(proposal({ state: 'APPLIED' }))).toMatch(/already applied/i);
    expect(applyBlockedReason(proposal({ state: 'REJECTED', decision: 'REJECTED' }))).toMatch(
      /rejected/i
    );
    expect(applyBlockedReason(proposal({ state: 'PENDING_REVIEW', decision: 'NONE' }))).toMatch(
      /approve this suggestion first/i
    );
    expect(
      applyBlockedReason(proposal({ stale: true, staleDetail: 'That bullet has been removed.' }))
    ).toBe('That bullet has been removed.');
    expect(
      applyBlockedReason(
        proposal({ verificationStatus: 'NEEDS_USER_INPUT', stateReason: 'Needs a figure.' })
      )
    ).toBe('Needs a figure.');
  });

  it('returns nothing when apply really is available', () => {
    expect(
      applyBlockedReason(proposal({ state: 'APPROVED', decision: 'APPROVED', applicable: true }))
    ).toBeNull();
  });
});

// ============================================================================
// LISTS
// ============================================================================

describe('review ordering and local bookkeeping', () => {
  it('puts what needs a decision first and settled things last', () => {
    const items = [
      proposal({ id: 'a', state: 'APPLIED', targetRef: 'a' }),
      proposal({ id: 'b', state: 'PENDING_REVIEW', targetRef: 'b' }),
      proposal({ id: 'c', state: 'UNAVAILABLE', targetRef: 'c' }),
      proposal({ id: 'd', state: 'APPROVED', targetRef: 'd' }),
      proposal({ id: 'e', state: 'REJECTED', targetRef: 'e' }),
      proposal({ id: 'f', state: 'STALE', targetRef: 'f' }),
    ];

    expect(sortForReview(items).map((item) => item.id)).toEqual(['b', 'd', 'f', 'e', 'a', 'c']);
  });

  it('does not mutate the list it was given', () => {
    const items = [proposal({ id: 'a', state: 'APPLIED' }), proposal({ id: 'b' })];
    const order = items.map((item) => item.id);
    sortForReview(items);
    expect(items.map((item) => item.id)).toEqual(order);
  });

  it('replaces one proposal without disturbing the others', () => {
    const items = [proposal({ id: 'a' }), proposal({ id: 'b' })];
    const updated = { ...items[1], state: 'APPROVED' as ProposalStateName };
    const next = replaceProposal(items, updated);

    expect(next[0]).toBe(items[0]);
    expect(next[1].state).toBe('APPROVED');
    expect(items[1].state).toBe('PENDING_REVIEW');
  });

  it('recounts a batch from the proposals actually held', () => {
    const items = [
      proposal({ id: 'a', state: 'APPLIED' }),
      proposal({ id: 'b', state: 'APPROVED' }),
      proposal({ id: 'c', state: 'REJECTED' }),
      proposal({ id: 'd', state: 'UNAVAILABLE' }),
      proposal({ id: 'e', state: 'APPROVED', stale: true }),
    ];

    expect(recountBatch(batch(), items).counts).toEqual({
      total: 5,
      pendingReview: 0,
      approved: 2,
      rejected: 1,
      applied: 1,
      unavailable: 1,
      stale: 1,
    });
  });
});

describe('locations', () => {
  it('prefers the server label', () => {
    expect(proposalLocation(proposal())).toBe('Backend Engineer @ Acme — bullet 1');
  });

  it('falls back to the address when there is no better label', () => {
    expect(proposalLocation(proposal({ label: 'experience:exp1:bullets:0' }))).toBe(
      'experience · bullets 1'
    );
  });
});
