/**
 * Resolve the local User row for an authenticated Clerk session.
 *
 * When a previous Clerk account was deleted (or deletion left the DB behind)
 * and the same email signs up again, any orphaned local User is purged so the
 * new account starts empty — never reattached to leftover resumes/summary.
 */

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { clerkClient } from '@clerk/nextjs/server';
import type { MainPurpose, Profile, User } from '@prisma/client';

import { deleteLocalAccountData } from '@/lib/account/delete-account';
import { canPurgeOrphanedAccount } from '@/lib/database-target';
import { db } from '@/lib/db';

export class EmailConflictError extends Error {
  readonly code = 'EMAIL_CONFLICT' as const;
  readonly email: string;
  readonly existingUserId: string;

  constructor(email: string, existingUserId: string) {
    super(
      'This email is already associated with another account. Please sign in with your original account or use a different email.'
    );
    this.name = 'EmailConflictError';
    this.email = email;
    this.existingUserId = existingUserId;
  }
}

/**
 * The email already has a row, but this process must not delete it.
 * A Clerk 404 here usually means localhost is signed into a different Clerk
 * app than the one that created the row, while both share one database.
 */
export class RemoteDatabaseProtectedError extends Error {
  readonly code = 'REMOTE_DATABASE_PROTECTED' as const;
  readonly email: string;
  readonly existingUserId: string;

  constructor(email: string, existingUserId: string) {
    super(
      'This email already has a profile in this database. Local development cannot delete it. Use the local Docker database, not production.'
    );
    this.name = 'RemoteDatabaseProtectedError';
    this.email = email;
    this.existingUserId = existingUserId;
  }
}

export type UserWithProfile = User & { profile: Profile | null };

export type GetOrCreateUserOptions = {
  clerkId: string;
  email: string;
  /** Extra fields applied only when creating a brand-new row */
  createData?: {
    mainPurpose?: MainPurpose | null;
  };
};

function isClerkUserNotFound(error: unknown): boolean {
  if (!isClerkAPIResponseError(error)) return false;
  if (error.status === 404) return true;
  return error.errors?.some((e) => e.code === 'resource_not_found') ?? false;
}

/**
 * Returns true when Clerk has no user for this id (safe to purge the DB row).
 * Propagates unexpected Clerk errors so we do not purge on outages.
 */
export async function isClerkUserMissing(clerkId: string): Promise<boolean> {
  try {
    const clerk = await clerkClient();
    await clerk.users.getUser(clerkId);
    return false;
  } catch (error) {
    if (isClerkUserNotFound(error)) return true;
    throw error;
  }
}

/**
 * Find the DB user for this Clerk session, creating a clean row as needed.
 *
 * If another row owns the email but its `clerkId` no longer exists in Clerk
 * (orphan from a failed/partial account deletion), that row is hard-deleted
 * (cascading all profiles/summary) and a fresh User is created for the new
 * Clerk identity. Live Clerk accounts that own the email still conflict.
 */
export async function getOrCreateUserForClerk(
  options: GetOrCreateUserOptions
): Promise<UserWithProfile> {
  const { clerkId, email, createData } = options;

  const existingByClerkId = await db.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (existingByClerkId) {
    return existingByClerkId;
  }

  const existingByEmail = await db.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (existingByEmail) {
    if (existingByEmail.clerkId === clerkId) {
      return existingByEmail;
    }

    const orphaned = await isClerkUserMissing(existingByEmail.clerkId);
    if (!orphaned) {
      console.error(
        '[getOrCreateUserForClerk] Email conflict:',
        email,
        'belongs to user',
        existingByEmail.id,
        'clerkId',
        existingByEmail.clerkId,
        'but session is',
        clerkId
      );
      throw new EmailConflictError(email, existingByEmail.id);
    }

    if (
      !canPurgeOrphanedAccount({
        nodeEnv: process.env.NODE_ENV,
        databaseUrl: process.env.DATABASE_URL,
      })
    ) {
      console.error(
        '[getOrCreateUserForClerk] Refusing to delete user',
        existingByEmail.id,
        'for email',
        email,
        'because this process is pointed at a remote database'
      );
      throw new RemoteDatabaseProtectedError(email, existingByEmail.id);
    }

    console.warn(
      '[getOrCreateUserForClerk] Purging orphaned user',
      existingByEmail.id,
      'for email',
      email,
      'old clerkId',
      existingByEmail.clerkId,
      '→ creating clean user for',
      clerkId
    );

    await deleteLocalAccountData(existingByEmail.id);
  }

  return db.user.create({
    data: {
      clerkId,
      email,
      ...(createData?.mainPurpose !== undefined ? { mainPurpose: createData.mainPurpose } : {}),
    },
    include: { profile: true },
  });
}
