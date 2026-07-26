/**
 * Resolve the local User row for an authenticated Clerk session.
 *
 * Handles the common case where a previous Clerk account was deleted (or
 * deletion left the DB behind) and the same email signed up again — without
 * letting a live Clerk account be taken over by another session.
 */

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { clerkClient } from '@clerk/nextjs/server';
import type { MainPurpose, Profile, User } from '@prisma/client';

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
 * Returns true when Clerk has no user for this id (safe to reclaim the DB row).
 * Propagates unexpected Clerk errors so we do not reclaim on outages.
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
 * Find the DB user for this Clerk session, creating or reclaiming as needed.
 *
 * Reclaim only happens when another row owns the email but its `clerkId` no
 * longer exists in Clerk (orphan from a failed/partial account deletion).
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

    console.warn(
      '[getOrCreateUserForClerk] Reclaiming orphaned user',
      existingByEmail.id,
      'for email',
      email,
      'old clerkId',
      existingByEmail.clerkId,
      '→',
      clerkId
    );

    return db.user.update({
      where: { id: existingByEmail.id },
      data: { clerkId },
      include: { profile: true },
    });
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
