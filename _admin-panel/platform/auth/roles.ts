/**
 * Assigning Platform roles (PLATFORM_TODO item 28).
 *
 * Server-only, maintainer-only, and deliberately small. This is not an IAM
 * system: it changes one column on one existing `Admin` row, to one of three
 * values, and records the attempt.
 *
 * **It cannot create or remove an admin.** Membership of the `Admin` table is
 * what `/api/admin/users/[id]/role` does, and that is product-user
 * administration with its own semantics. Item 28 does not touch it — a role
 * change here only moves an admin between viewer, runner and maintainer.
 */

import { db } from '@/lib/db';

import { appendAuditEvent, type AuditOptions } from '../drift/audit';
import { hasPlatformPermission, isPlatformRole, type PlatformRole } from './types';

/**
 * The real implementation: one transaction, with the maintainer rows locked.
 *
 * `FOR UPDATE` on every maintainer row is what serializes two concurrent
 * demotions. The first transaction holds those locks until it commits; the
 * second blocks on them, then reads a count that already reflects the first
 * one's write. Without the lock, both read the pre-change count and both
 * succeed — the write-skew this exists to prevent.
 *
 * Read committed is enough *because of* the lock, so no isolation level is
 * set and no serialization failure has to be retried.
 */
const exclusiveAssign: ExclusiveAssign = async (targetAdminId, apply) => {
  await db.$transaction(async (tx) => {
    // Lock first, then read. The cast is needed because `platformRole` is an
    // enum column.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Admin"
      WHERE "platformRole" = 'maintainer'::"PlatformRole"
      FOR UPDATE
    `;

    const target = await tx.admin.findUnique({
      where: { id: targetAdminId },
      select: { platformRole: true },
    });

    const { write } = await apply({
      targetRole: target?.platformRole ?? null,
      maintainers: locked.length,
    });

    if (write !== null) {
      await tx.admin.update({ where: { id: targetAdminId }, data: { platformRole: write } });
    }
  });
};

/** What came of an assignment attempt. */
export type AssignRoleResult =
  | { ok: true; adminId: string; from: PlatformRole; to: PlatformRole }
  | {
      ok: false;
      reason: 'insufficient-role' | 'invalid-role' | 'unknown-admin' | 'last-maintainer' | 'failed';
      detail: string;
    };

/**
 * What happens inside the transaction, with the maintainer rows locked.
 *
 * Returns the target's current role and how many maintainers exist, having
 * already taken the locks that make both figures stable for the length of
 * the transaction, and applies the write.
 */
export type ExclusiveAssign = (
  targetAdminId: string,
  apply: (current: {
    targetRole: string | null;
    maintainers: number;
  }) => Promise<{ write: PlatformRole | null }>
) => Promise<void>;

export type AssignRoleOptions = {
  audit?: AuditOptions;
  /**
   * The atomic seam, so a test never touches a real Admin row.
   *
   * One seam rather than the three it replaced (`readAdmin`,
   * `countMaintainers`, `writeRole`): those were separate calls, and
   * separate calls are exactly what let two demotions race.
   */
  exclusive?: ExclusiveAssign;
};

/**
 * Changes one admin's Platform role.
 *
 * ## Why the last maintainer cannot be demoted
 *
 * `roles:assign` is a maintainer permission, so the only people who can hand
 * it out are the people who have it. Demote the last maintainer and nobody
 * can promote anyone ever again: there is no recovery surface in this
 * platform, no break-glass flag, and no CLI for it. The only way back would
 * be editing the database by hand.
 *
 * So the floor is enforced here, on the server, and the refusal is audited
 * like any other attempt. It is checked against a live count rather than
 * against anything the caller said, and it fires whether an admin is
 * demoting someone else or themselves.
 */
export async function assignPlatformRole(
  actor: { adminId: string; role: PlatformRole },
  targetAdminId: string,
  nextRole: unknown,
  options: AssignRoleOptions = {}
): Promise<AssignRoleResult> {
  const audit = (result: 'ok' | 'refused' | 'failed', reason: string | null, detail: string) => {
    appendAuditEvent(
      {
        action: 'roles:assign',
        result,
        // The admin whose role was to change. An opaque id, never an email.
        path: targetAdminId,
        quarantineId: null,
        signal: null,
        group: null,
        evidence: [detail],
        sha256Before: null,
        sha256After: null,
        approval: null,
        actorId: actor.adminId,
        actorRole: actor.role,
        reason,
      },
      options.audit ?? {}
    );
  };

  // The caller's own permission, checked here too.
  //
  // The route already gates this with `enforcePlatformAction`, and it is the
  // only caller. But a function that changes authorization should not depend
  // on its callers remembering to authorize — a non-vacuity run showed a
  // runner reaching this directly and succeeding, which is a gap a future
  // second caller would fall into.
  if (!hasPlatformPermission(actor.role, 'roles:assign')) {
    audit('refused', 'insufficient-role', 'the acting role cannot assign roles');
    return {
      ok: false,
      reason: 'insufficient-role',
      detail: `Assigning Platform roles is maintainer-only. Yours is ${actor.role}.`,
    };
  }

  // Only one of the three. An arbitrary string never reaches the database,
  // and the Prisma enum would refuse it even if it did.
  if (!isPlatformRole(nextRole)) {
    audit('refused', 'invalid-role', 'the requested role is not one of the three');
    return {
      ok: false,
      reason: 'invalid-role',
      detail: 'Role must be viewer, runner or maintainer.',
    };
  }

  const exclusive = options.exclusive ?? exclusiveAssign;

  try {
    // Every decision below happens inside the transaction, with the
    // maintainer rows locked, so the count the floor is checked against
    // cannot change between the check and the write.
    let outcome: AssignRoleResult | null = null;

    await exclusive(targetAdminId, async ({ targetRole, maintainers }) => {
      if (targetRole === null) {
        outcome = { ok: false, reason: 'unknown-admin', detail: 'No admin with that id.' };
        return { write: null };
      }

      const from = isPlatformRole(targetRole) ? targetRole : null;
      if (from === null) {
        outcome = {
          ok: false,
          reason: 'invalid-role',
          detail: 'That admin has a stored role this platform does not recognise.',
        };
        return { write: null };
      }

      if (from === nextRole) {
        outcome = { ok: true, adminId: targetAdminId, from, to: nextRole };
        return { write: null };
      }

      // The floor, against a locked count.
      if (from === 'maintainer' && nextRole !== 'maintainer' && maintainers <= 1) {
        outcome = {
          ok: false,
          reason: 'last-maintainer',
          detail:
            'This is the only maintainer. Promote someone else first — nothing else in the platform can hand the role back.',
        };
        return { write: null };
      }

      outcome = { ok: true, adminId: targetAdminId, from, to: nextRole };
      return { write: nextRole };
    });

    const settled = outcome as AssignRoleResult | null;
    if (settled === null) {
      audit('failed', 'failed', 'the role change did not complete');
      return { ok: false, reason: 'failed', detail: 'The role change did not complete.' };
    }

    if (settled.ok) {
      audit(
        'ok',
        null,
        settled.from === settled.to ? `already ${settled.to}` : `${settled.from} -> ${settled.to}`
      );
    } else {
      audit(
        'refused',
        settled.reason,
        settled.reason === 'last-maintainer'
          ? 'refused: this is the only maintainer and there is no recovery path'
          : settled.detail
      );
    }

    return settled;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0].slice(0, 200) : 'unknown';
    audit('failed', 'failed', 'the role change did not complete');
    return { ok: false, reason: 'failed', detail };
  }
}

/** Admins and their roles, for the maintainer-only management view. */
export async function listPlatformAdmins(): Promise<
  { adminId: string; role: PlatformRole | null }[]
> {
  const rows = await db.admin.findMany({
    select: { id: true, platformRole: true },
    orderBy: { createdAt: 'asc' },
  });

  // No email, no Clerk id: this view is about roles, and an id is enough to
  // act on one.
  return rows.map((row) => ({
    adminId: row.id,
    role: isPlatformRole(row.platformRole) ? row.platformRole : null,
  }));
}
