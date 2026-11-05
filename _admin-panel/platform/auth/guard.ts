/**
 * Reading an admin's Platform role and enforcing it (PLATFORM_TODO item 28).
 *
 * Server-only. Two rules shape this file:
 *
 * **The role comes from the database and nowhere else.** Not from the request
 * body, not from a query parameter, not from a header, not from an
 * environment variable, and never inferred from an email address or domain.
 * The only input is the `Admin.id` that `requireAdmin()` already returned,
 * and the only source is `Admin.platformRole`.
 *
 * **It fails closed.** A missing row, an unreadable database or a stored
 * value outside the three-role union all deny. The Prisma enum makes the
 * last case unrepresentable through normal writes, but a hand-edited
 * database or a future migration could still produce one, and the honest
 * answer to "I do not recognise this role" is no.
 *
 * `lib/admin.ts` is untouched. Item 28 adds a second, indexed lookup rather
 * than widening the admin context every product route depends on.
 */

import { db } from '@/lib/db';

import {
  hasPlatformPermission,
  isPlatformRole,
  type PlatformPermission,
  type PlatformRole,
} from './types';

/** Why a permission check said no. */
export type PlatformDenialReason =
  | 'unknown-admin'
  | 'invalid-role'
  | 'insufficient-role'
  | 'lookup-failed';

export type PlatformAuthz =
  | { allowed: true; role: PlatformRole }
  | { allowed: false; role: PlatformRole | null; reason: PlatformDenialReason };

/** Thrown by `requirePlatformPermission`. Carries a 403, like `requireAdmin`. */
export class PlatformPermissionError extends Error {
  readonly status = 403;
  readonly reason: PlatformDenialReason;
  readonly role: PlatformRole | null;
  readonly permission: PlatformPermission;

  constructor(permission: PlatformPermission, authz: Extract<PlatformAuthz, { allowed: false }>) {
    super(
      authz.reason === 'insufficient-role'
        ? `This action needs a higher Platform role. Yours is ${authz.role}.`
        : 'Your Platform role could not be established.'
    );
    this.name = 'PlatformPermissionError';
    this.permission = permission;
    this.reason = authz.reason;
    this.role = authz.role;
  }
}

export type RoleLookup = (adminId: string) => Promise<unknown>;

/** The real lookup: one indexed read of the acting admin's own row. */
async function readRole(adminId: string): Promise<unknown> {
  const admin = await db.admin.findUnique({
    where: { id: adminId },
    select: { platformRole: true },
  });

  return admin?.platformRole;
}

/**
 * The acting admin's role, or null when it cannot be established.
 *
 * Null is not a role and is never treated as one. Callers that need a role
 * to render with should show the denial, not a default.
 */
export async function getPlatformRole(
  adminId: string,
  lookup: RoleLookup = readRole
): Promise<PlatformRole | null> {
  try {
    const value = await lookup(adminId);
    return isPlatformRole(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether this admin may do this, with the reason when not.
 *
 * Returns rather than throws, so a caller can audit the denial before
 * answering. Every privileged route does exactly that.
 */
export async function authorizePlatform(
  adminId: string,
  permission: PlatformPermission,
  lookup: RoleLookup = readRole
): Promise<PlatformAuthz> {
  let value: unknown;
  try {
    value = await lookup(adminId);
  } catch {
    return { allowed: false, role: null, reason: 'lookup-failed' };
  }

  if (value === undefined || value === null) {
    return { allowed: false, role: null, reason: 'unknown-admin' };
  }
  if (!isPlatformRole(value)) {
    // A value the union does not contain. Denied, not defaulted.
    return { allowed: false, role: null, reason: 'invalid-role' };
  }
  if (!hasPlatformPermission(value, permission)) {
    return { allowed: false, role: value, reason: 'insufficient-role' };
  }

  return { allowed: true, role: value };
}

/**
 * Throws unless this admin may do this.
 *
 * For callers with nothing to audit. The routes use `authorizePlatform` so a
 * refusal is recorded before it is returned.
 */
export async function requirePlatformPermission(
  adminId: string,
  permission: PlatformPermission,
  lookup: RoleLookup = readRole
): Promise<PlatformRole> {
  const authz = await authorizePlatform(adminId, permission, lookup);
  if (!authz.allowed) throw new PlatformPermissionError(permission, authz);
  return authz.role;
}
