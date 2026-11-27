/**
 * Phase 4, Part 3 — the security audit, as executable assertions.
 *
 * Every test here corresponds to a question the audit asked. Where the answer
 * was "already safe", the test pins it so it stays that way. Where the audit
 * found something — the two unscoped internal queries, the idempotency race —
 * the test is the proof the fix works.
 *
 * Cross-user and cross-resume access is also exercised against real
 * PostgreSQL in `__tests__/integration/resume-proposals.pg.test.ts`. This file
 * covers what is better checked without a database: SQL construction, the
 * agent boundary, and the shapes a hostile client can put on the wire.
 */

import { describe, expect, it } from 'vitest';

import { buildApplyStatement, resolveApplyTarget } from '@/lib/resume-proposals/apply-target';
import { transition, verificationStatusFromVerdict } from '@/lib/resume-proposals/state';
import { buildGenerateRequest } from '@/lib/resume-proposals/client';

import type { ProposalDecision, ProposalState } from '@prisma/client';

// ============================================================================
// E. SQL AND DATABASE SAFETY
// ============================================================================

describe('the apply statement cannot be steered by stored text', () => {
  function statement(ref: string, original: string, proposed: string, recordId = 'exp1') {
    const resolution = resolveApplyTarget(ref);
    if (!resolution.ok) throw new Error(resolution.reason);
    const sql = buildApplyStatement({
      resolved: resolution.resolved,
      resumeId: 'resume_1',
      recordId,
      originalText: original,
      proposedText: proposed,
    });
    return {
      text: (sql as unknown as { text: string }).text,
      values: (sql as unknown as { values: unknown[] }).values,
    };
  }

  it('binds every piece of text as a parameter', () => {
    const hostile = `'); DROP TABLE "Profile"; --`;
    const { text, values } = statement('experience:exp1:bullets:0', hostile, hostile);

    expect(text).not.toContain('DROP TABLE');
    expect(text).not.toContain(hostile);
    expect(values).toContain(hostile);
    // Only placeholders ever carry content.
    expect(text).toMatch(/\$\d+/);
  });

  it('binds a hostile record id rather than interpolating it', () => {
    const hostile = `exp1" OR "1"="1`;
    const { text, values } = statement('experience:exp1:bullets:0', 'a', 'b', hostile);

    expect(text).not.toContain('OR "1"="1');
    expect(values).toContain(hostile);
  });

  it('names tables and columns from a closed set, never from input', () => {
    // Every statement the builder can produce, enumerated.
    const refs = [
      'summary:profile:summary',
      'experience:exp1:bullets:0',
      'project:proj1:description',
      'project:proj1:highlights:0',
    ];
    const tables = new Set<string>();
    const columns = new Set<string>();

    for (const ref of refs) {
      const { text } = statement(ref, 'a', 'b', ref.split(':')[1]);
      tables.add(/UPDATE\s+"(\w+)"/.exec(text)![1]);
      columns.add(/SET\s+"(\w+)"/.exec(text)![1]);
    }

    expect([...tables].sort()).toEqual(['Profile', 'Project', 'WorkExperience']);
    expect([...columns].sort()).toEqual(['bullets', 'description', 'highlights', 'summary']);
  });

  it('refuses every target outside the rewritable allow-list', () => {
    for (const ref of [
      'experience:exp1:company',
      'experience:exp1:role',
      'experience:exp1:startDate',
      'education:edu1:degree',
      'education:edu1:institution',
      'certification:c1:name',
      'profile:p1:email',
      'summary:profile:summary; DROP TABLE "Profile"',
      '../../etc/passwd',
      '',
    ]) {
      expect(resolveApplyTarget(ref).ok, ref).toBe(false);
    }
  });

  it('refuses an array subscript that is not a plain bounded integer', () => {
    for (const ref of [
      'experience:exp1:bullets:-1',
      'experience:exp1:bullets:1e3',
      'experience:exp1:bullets:0x10',
      'experience:exp1:bullets:1.5',
      'experience:exp1:bullets:',
      'experience:exp1:bullets',
    ]) {
      expect(resolveApplyTarget(ref).ok, ref).toBe(false);
    }
  });

  it('never lets a subscript reach raw SQL unbounded', () => {
    // The one `Prisma.raw` in the apply path is the subscript. It is reached
    // only through a resolution that has already proved the value is a
    // non-negative integer, and the builder bounds it again.
    const resolution = resolveApplyTarget('experience:exp1:bullets:0');
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(() =>
      buildApplyStatement({
        resolved: { ...resolution.resolved, index: 999_999 },
        resumeId: 'r',
        recordId: 'e',
        originalText: 'a',
        proposedText: 'b',
      })
    ).toThrow(/Refusing to build/);

    expect(() =>
      buildApplyStatement({
        resolved: { ...resolution.resolved, index: Number.NaN },
        resumeId: 'r',
        recordId: 'e',
        originalText: 'a',
        proposedText: 'b',
      })
    ).toThrow(/Refusing to build/);
  });

  it('scopes every write to the owning resume', () => {
    // A stored `targetRecordId` pointing at another user's row matches
    // nothing, because the row's `profileId` is in the WHERE.
    for (const ref of [
      'experience:exp1:bullets:0',
      'project:proj1:highlights:0',
      'project:proj1:description',
    ]) {
      const { text } = statement(ref, 'a', 'b', ref.split(':')[1]);
      expect(text).toContain('"profileId" =');
    }
    // The summary lives on the resume row, so its own id is the scope.
    expect(statement('summary:profile:summary', 'a', 'b', 'profile').text).toContain('"id" =');
  });

  it('makes the original text the swap condition on every statement', () => {
    // This is what stops a stale proposal overwriting newer content.
    for (const ref of [
      'summary:profile:summary',
      'experience:exp1:bullets:0',
      'project:proj1:description',
      'project:proj1:highlights:0',
    ]) {
      const { text, values } = statement(ref, 'ORIGINAL', 'NEW', ref.split(':')[1]);
      expect(text).toMatch(/WHERE[\s\S]*=\s*\$\d+\s*$/);
      expect(values).toContain('ORIGINAL');
      expect(values).toContain('NEW');
    }
  });
});

// ============================================================================
// B. PROPOSAL INTEGRITY
// ============================================================================

describe('a client cannot talk its way past verification', () => {
  it('maps only the verifier’s own four verdicts, treating anything else as unverified', () => {
    expect(verificationStatusFromVerdict('approved')).toBe('APPROVED');
    for (const forged of [
      'APPROVED',
      'Approved',
      'approved ',
      'true',
      'verified',
      'ok',
      '',
      undefined,
      null,
    ]) {
      expect(verificationStatusFromVerdict(forged as string)).toBe('UNVERIFIED');
    }
  });

  it('requires the verdict and the human decision to agree before an apply', () => {
    // Neither alone is enough, which is the entire safety argument.
    expect(
      transition(
        { state: 'APPROVED', decision: 'APPROVED', verificationStatus: 'UNVERIFIED' },
        'apply'
      ).ok
    ).toBe(false);
    expect(
      transition({ state: 'APPROVED', decision: 'NONE', verificationStatus: 'APPROVED' }, 'apply')
        .ok
    ).toBe(false);
    expect(
      transition(
        { state: 'APPROVED', decision: 'APPROVED', verificationStatus: 'APPROVED' },
        'apply'
      ).ok
    ).toBe(true);
  });

  it('refuses an apply from every state except APPROVED', () => {
    const states: ProposalState[] = [
      'PENDING_REVIEW',
      'REJECTED',
      'APPLIED',
      'STALE',
      'UNAVAILABLE',
    ];
    for (const state of states) {
      expect(
        transition({ state, decision: 'APPROVED', verificationStatus: 'APPROVED' }, 'apply').ok,
        state
      ).toBe(false);
    }
  });

  it('cannot be re-approved or re-rejected once applied', () => {
    const applied = {
      state: 'APPLIED' as ProposalState,
      decision: 'APPROVED' as ProposalDecision,
      verificationStatus: 'APPROVED' as const,
    };
    expect(transition(applied, 'approve').ok).toBe(false);
    expect(transition(applied, 'reject').ok).toBe(false);
    expect(transition(applied, 'apply').ok).toBe(false);
  });
});

describe('a client cannot smuggle fields into a generation request', () => {
  it('builds a body from a closed set of keys', () => {
    const body = buildGenerateRequest({
      mode: 'jd',
      jobDescription: 'Senior Backend Engineer…',
      targetRole: 'ignored outside role mode',
      idempotencyKey: 'key-123456',
    });

    expect(Object.keys(body).sort()).toEqual(['idempotencyKey', 'jobDescription', 'mode']);
    for (const forbidden of [
      'verified',
      'verificationStatus',
      'state',
      'decision',
      'proposedText',
      'targetRef',
      'userId',
      'resumeId',
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });
});

// ============================================================================
// A. OWNERSHIP, AT THE SERVICE BOUNDARY
// ============================================================================

describe('internal reads and writes are scoped by owner, not by row id alone', () => {
  const source = readServiceSource();

  it('scopes the resume snapshot read by user', () => {
    // Reached today only after an ownership-scoped lookup, so this was never
    // exploitable — but a read of a user's resume text keyed on nothing but a
    // profile id is one new call site away from being an IDOR.
    expect(source).toContain('loadResumeSnapshot(\n  userId: string,\n  resumeId: string\n)');
    expect(source).toMatch(/findFirst\(\{\s*where: \{ id: resumeId, userId \}/);
    expect(source).not.toMatch(/findUnique\(\{\s*where: \{ id: resumeId \}/);
  });

  it('scopes the unavailable-marking write by user and resume', () => {
    expect(source).toMatch(/markUnavailable\(\s*userId: string,\s*resumeId: string/);
    const block = source.slice(source.indexOf('async function markUnavailable'));
    expect(block).toContain('userId,');
    expect(block).toContain('profileId: resumeId,');
  });

  it('never queries a proposal by id alone', () => {
    // Every proposal lookup and write must carry the owner.
    const lookups = [
      ...source.matchAll(/resumeEditProposal\.(findFirst|updateMany)\(\{\s*where: \{([\s\S]*?)\}/g),
    ];
    expect(lookups.length).toBeGreaterThan(3);
    for (const [, method, where] of lookups) {
      expect(where, `${method} must scope by userId`).toContain('userId');
    }
  });
});

function readServiceSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('node:path') as typeof import('node:path');
  return readFileSync(nodePath.join(process.cwd(), 'services/resume-proposals.service.ts'), 'utf8');
}
