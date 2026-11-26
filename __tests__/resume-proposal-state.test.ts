/**
 * Phase 3B.1 — the proposal state machine and target resolution.
 *
 * Pure functions, no database. The transitions are tested exhaustively rather
 * than by example because the table *is* the specification: anything these
 * allow, a route will allow, and the one that matters — "apply" — is the only
 * way an agent's words reach somebody's resume.
 */

import { describe, expect, it } from 'vitest';

import {
  buildApplyStatement,
  readCurrentValue,
  resolveApplyTarget,
} from '@/lib/resume-proposals/apply-target';
import {
  batchStatusFromRun,
  initialState,
  staleCheckApplies,
  transition,
  unavailableReason,
  verificationStatusFromVerdict,
} from '@/lib/resume-proposals/state';

import type { ProposalDecision, ProposalState, ProposalVerificationStatus } from '@prisma/client';

const ALL_STATES: ProposalState[] = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'STALE',
  'UNAVAILABLE',
];

function facts(
  state: ProposalState,
  decision: ProposalDecision = 'NONE',
  verificationStatus: ProposalVerificationStatus = 'APPROVED'
) {
  return { state, decision, verificationStatus };
}

// ============================================================================
// MAPPING FROM AGENT OUTPUT
// ============================================================================

describe('what the agent said becomes what is stored', () => {
  it.each([
    ['approved', 'APPROVED'],
    ['revision_required', 'REVISION_REQUIRED'],
    ['rejected', 'REJECTED'],
    ['needs_user_input', 'NEEDS_USER_INPUT'],
  ])('maps the %s verdict', (verdict, expected) => {
    expect(verificationStatusFromVerdict(verdict)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['approved_by_me'], ['APPROVED']])(
    'treats %s as unverified rather than guessing',
    (verdict) => {
      expect(verificationStatusFromVerdict(verdict as string)).toBe('UNVERIFIED');
    }
  );

  it('distinguishes "nobody checked" from "checked and refused"', () => {
    expect(verificationStatusFromVerdict(undefined)).not.toBe(
      verificationStatusFromVerdict('rejected')
    );
    expect(unavailableReason('UNVERIFIED')).toMatch(/never independently verified/i);
    expect(unavailableReason('REJECTED')).toMatch(/does not support/i);
  });

  it.each([
    ['complete', 'COMPLETE'],
    ['incomplete', 'INCOMPLETE'],
    ['unverified', 'UNVERIFIED'],
    ['failed', 'FAILED'],
    [undefined, 'FAILED'],
    ['something else', 'FAILED'],
  ])('maps run status %s', (status, expected) => {
    expect(batchStatusFromRun(status as string)).toBe(expected);
  });
});

describe('only a verifier-approved proposal is ever offered for review', () => {
  it('starts an approved proposal at pending review', () => {
    expect(initialState('APPROVED')).toBe('PENDING_REVIEW');
  });

  it.each<[ProposalVerificationStatus]>([
    ['REVISION_REQUIRED'],
    ['REJECTED'],
    ['NEEDS_USER_INPUT'],
    ['UNVERIFIED'],
  ])('starts a %s proposal unavailable, with a reason', (status) => {
    expect(initialState(status)).toBe('UNAVAILABLE');
    expect(unavailableReason(status)).toBeTruthy();
  });
});

// ============================================================================
// TRANSITIONS
// ============================================================================

describe('the verification verdict gates every action', () => {
  it.each<[ProposalVerificationStatus]>([
    ['REVISION_REQUIRED'],
    ['REJECTED'],
    ['NEEDS_USER_INPUT'],
    ['UNVERIFIED'],
  ])('refuses approve, reject and apply for a %s proposal', (status) => {
    // Even from a state that would otherwise allow it, and even with the
    // decision already recorded — the verdict is checked first.
    for (const action of ['approve', 'reject', 'apply'] as const) {
      const result = transition(facts('APPROVED', 'APPROVED', status), action);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe('not_verified');
    }
  });
});

describe('approve', () => {
  it.each<[ProposalState, boolean]>([
    ['PENDING_REVIEW', true],
    ['APPROVED', true],
    ['REJECTED', true],
    ['APPLIED', false],
    ['STALE', false],
    ['UNAVAILABLE', false],
  ])('from %s is allowed: %s', (state, allowed) => {
    const result = transition(facts(state), 'approve');
    expect(result.ok).toBe(allowed);
    if (result.ok) {
      expect(result.state).toBe('APPROVED');
      expect(result.decision).toBe('APPROVED');
    }
  });

  it('is idempotent', () => {
    const once = transition(facts('PENDING_REVIEW'), 'approve');
    expect(once.ok && once.state).toBe('APPROVED');
    const twice = transition(facts('APPROVED', 'APPROVED'), 'approve');
    expect(twice.ok && twice.state).toBe('APPROVED');
  });
});

describe('reject', () => {
  it.each<[ProposalState, boolean]>([
    ['PENDING_REVIEW', true],
    ['APPROVED', true],
    ['REJECTED', true],
    ['APPLIED', false],
    ['STALE', false],
    ['UNAVAILABLE', false],
  ])('from %s is allowed: %s', (state, allowed) => {
    const result = transition(facts(state), 'reject');
    expect(result.ok).toBe(allowed);
    if (result.ok) {
      expect(result.state).toBe('REJECTED');
      expect(result.decision).toBe('REJECTED');
    }
  });
});

describe('apply', () => {
  it('needs both the verdict and the human decision', () => {
    // Verified, but the user said nothing.
    expect(transition(facts('PENDING_REVIEW', 'NONE'), 'apply').ok).toBe(false);
    // The user approved and the state agrees.
    expect(transition(facts('APPROVED', 'APPROVED'), 'apply').ok).toBe(true);
  });

  it('is refused from every state except APPROVED', () => {
    for (const state of ALL_STATES) {
      const result = transition(facts(state, 'APPROVED'), 'apply');
      expect(result.ok).toBe(state === 'APPROVED');
    }
  });

  it('refuses a state that says approved while the decision does not', () => {
    // Belt and braces: the two columns are checked independently, so a row
    // that somehow held one without the other still cannot be applied.
    expect(transition(facts('APPROVED', 'NONE'), 'apply').ok).toBe(false);
    expect(transition(facts('APPROVED', 'REJECTED'), 'apply').ok).toBe(false);
  });

  it('explains each refusal in terms the user can act on', () => {
    const applied = transition(facts('APPLIED', 'APPROVED'), 'apply');
    expect(applied.ok === false && applied.reason).toMatch(/already been applied/i);

    const rejected = transition(facts('REJECTED', 'REJECTED'), 'apply');
    expect(rejected.ok === false && rejected.reason).toMatch(/was rejected/i);

    const stale = transition(facts('STALE', 'APPROVED'), 'apply');
    expect(stale.ok === false && stale.reason).toMatch(/resume changed/i);

    const pending = transition(facts('PENDING_REVIEW', 'NONE'), 'apply');
    expect(pending.ok === false && pending.reason).toMatch(/Approve this suggestion/i);
  });

  it('produces APPLIED and nothing else', () => {
    const result = transition(facts('APPROVED', 'APPROVED'), 'apply');
    expect(result.ok && result.state).toBe('APPLIED');
    expect(result.ok && result.decision).toBe('APPROVED');
  });
});

describe('staleness only matters where it could still change something', () => {
  it.each<[ProposalState, boolean]>([
    ['PENDING_REVIEW', true],
    ['APPROVED', true],
    ['REJECTED', false],
    ['APPLIED', false],
    ['STALE', false],
    ['UNAVAILABLE', false],
  ])('%s → %s', (state, expected) => {
    expect(staleCheckApplies(state)).toBe(expected);
  });
});

// ============================================================================
// TARGET RESOLUTION
// ============================================================================

describe('resolving a stored target onto a table and column', () => {
  it.each([
    ['summary:profile:summary', 'Profile', 'summary', undefined],
    ['experience:exp1:bullets:0', 'WorkExperience', 'bullets', 0],
    ['project:proj1:description', 'Project', 'description', undefined],
    ['project:proj1:highlights:2', 'Project', 'highlights', 2],
  ])('resolves %s', (ref, table, column, index) => {
    const result = resolveApplyTarget(ref);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.table).toBe(table);
    expect(result.resolved.column).toBe(column);
    expect(result.resolved.index).toBe(index);
  });

  it.each([
    ['experience:exp1:company'],
    ['education:edu1:degree'],
    ['experience:exp1:bullets'],
    ['experience:exp1:bullets:-1'],
    ['summary:exp1:summary'],
    ['nonsense'],
    [''],
  ])('refuses %s', (ref) => {
    expect(resolveApplyTarget(ref).ok).toBe(false);
  });

  it('refuses a summary target that does not name the resume row', () => {
    // The sentinel is what makes the Profile write scope to the resume. A
    // stored target carrying some other record id is not this resume's
    // summary and must not be treated as if it were.
    const result = resolveApplyTarget('summary:exp1:summary');
    expect(result.ok).toBe(false);
  });
});

describe('the statement that performs the edit', () => {
  function statementFor(ref: string, original = 'OLD', proposed = 'NEW') {
    const resolution = resolveApplyTarget(ref);
    if (!resolution.ok) throw new Error(resolution.reason);
    const sql = buildApplyStatement({
      resolved: resolution.resolved,
      resumeId: 'resume_1',
      recordId: resolution.resolved.target.recordId,
      originalText: original,
      proposedText: proposed,
    });
    return {
      text: (sql as unknown as { text: string }).text.replace(/\s+/g, ' ').trim(),
      values: (sql as unknown as { values: unknown[] }).values,
    };
  }

  it('is a compare-and-swap on the exact bullet, not a whole-array write', () => {
    const { text, values } = statementFor('experience:exp1:bullets:2');

    // Postgres arrays are 1-indexed, so index 2 is subscript 3.
    expect(text).toContain('SET "bullets"[3] = $1');
    expect(text).toContain('"bullets"[3] = $4');
    // The original text is the swap condition, bound as a parameter.
    expect(values).toEqual(['NEW', 'exp1', 'resume_1', 'OLD']);
  });

  it('scopes every child-table write to the owning resume', () => {
    for (const ref of ['experience:exp1:bullets:0', 'project:proj1:highlights:1']) {
      const { text, values } = statementFor(ref);
      expect(text).toContain('"profileId" = $3');
      expect(values).toContain('resume_1');
    }
  });

  it('scopes a summary write to the resume row itself', () => {
    const { text, values } = statementFor('summary:profile:summary');
    expect(text).toContain('UPDATE "Profile"');
    expect(text).toContain('WHERE "id" = $2 AND "summary" = $3');
    // The sentinel record id is not interpolated anywhere.
    expect(values).toEqual(['NEW', 'resume_1', 'OLD']);
  });

  it('stamps updatedAt, which a raw statement would otherwise skip', () => {
    for (const ref of [
      'summary:profile:summary',
      'experience:exp1:bullets:0',
      'project:proj1:description',
      'project:proj1:highlights:0',
    ]) {
      expect(statementFor(ref).text).toContain('"updatedAt" = NOW()');
    }
  });

  it('binds the text as parameters rather than inlining it', () => {
    const nasty = `'; DROP TABLE "Profile"; --`;
    const { text, values } = statementFor('summary:profile:summary', nasty, nasty);
    expect(text).not.toContain('DROP TABLE');
    expect(values).toContain(nasty);
  });
});

describe('reading the live value for staleness reporting', () => {
  const rows = {
    profile: { id: 'resume_1', summary: 'A summary.' },
    experiences: [{ id: 'exp1', bullets: ['one', 'two'] }],
    projects: [{ id: 'proj1', description: 'A project.', highlights: ['first'] }],
  };

  function read(ref: string) {
    const resolution = resolveApplyTarget(ref);
    if (!resolution.ok) throw new Error(resolution.reason);
    return readCurrentValue(resolution.resolved, rows);
  }

  it('reads each kind of target', () => {
    expect(read('summary:profile:summary')).toEqual({ ok: true, text: 'A summary.' });
    expect(read('experience:exp1:bullets:1')).toEqual({ ok: true, text: 'two' });
    expect(read('project:proj1:description')).toEqual({ ok: true, text: 'A project.' });
    expect(read('project:proj1:highlights:0')).toEqual({ ok: true, text: 'first' });
  });

  it('reports a deleted record and a removed index differently', () => {
    const missingRecord = read('experience:gone:bullets:0');
    expect(missingRecord.ok).toBe(false);
    expect(missingRecord.ok === false && missingRecord.reason).toBe('missing-record');

    const missingIndex = read('experience:exp1:bullets:9');
    expect(missingIndex.ok).toBe(false);
    expect(missingIndex.ok === false && missingIndex.reason).toBe('missing-index');
    expect(missingIndex.ok === false && missingIndex.detail).toMatch(/removed or.*reordered/i);
  });
});
