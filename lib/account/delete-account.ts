/**
 * Permanent account deletion — removes the Clerk auth user and all local data.
 *
 * Order matters: Clerk is deleted first so the user cannot sign back in and
 * recreate an account if the database cleanup fails mid-way.
 */

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { db } from '@/lib/db';

export class AccountDeletionError extends Error {
  readonly code: 'CLERK_DELETE_FAILED' | 'DATABASE_DELETE_FAILED';

  constructor(code: AccountDeletionError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AccountDeletionError';
    this.code = code;
  }
}

export type DeleteClerkUser = (clerkId: string) => Promise<void>;

export interface DeleteAccountResult {
  clerkDeleted: boolean;
  databaseDeleted: boolean;
  userId: string | null;
}

function isClerkUserAlreadyGone(error: unknown): boolean {
  if (!isClerkAPIResponseError(error)) return false;
  if (error.status === 404) return true;
  return error.errors?.some((e) => e.code === 'resource_not_found') ?? false;
}

/**
 * Delete the Clerk user. Treats "already deleted" as success so retries are safe.
 */
export async function deleteClerkAccount(
  clerkId: string,
  deleteClerkUser: DeleteClerkUser
): Promise<void> {
  try {
    await deleteClerkUser(clerkId);
  } catch (error) {
    if (isClerkUserAlreadyGone(error)) {
      return;
    }
    throw new AccountDeletionError(
      'CLERK_DELETE_FAILED',
      'Failed to delete authentication account. Please try again or contact support.',
      { cause: error }
    );
  }
}

/**
 * Delete local user data. Clears circular profile pointers first, then deletes
 * the User row (Prisma cascades owned profiles and related records).
 */
export async function deleteLocalAccountData(userId: string): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      // Avoid circular FK issues between User ↔ Profile (active/primary pointers)
      await tx.user.update({
        where: { id: userId },
        data: {
          profile: { disconnect: true },
          primaryProfile: { disconnect: true },
        },
      });

      // AgentRun.userId is not a formal FK — clear it so no orphan references remain
      await tx.agentRun.updateMany({
        where: { userId },
        data: { userId: null },
      });

      // Cascades: owned profiles + all profile children, import jobs/logs/sessions, share tokens
      await tx.user.delete({
        where: { id: userId },
      });
    });
  } catch (error) {
    throw new AccountDeletionError(
      'DATABASE_DELETE_FAILED',
      'Authentication was removed, but cleaning up account data failed. Please contact support.',
      { cause: error }
    );
  }
}

/**
 * Fully delete an account: Clerk auth first, then database data.
 */
export async function deleteAccountCompletely(
  clerkId: string,
  deleteClerkUser: DeleteClerkUser
): Promise<DeleteAccountResult> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  // Always remove Clerk so the identity cannot sign in again
  await deleteClerkAccount(clerkId, deleteClerkUser);

  if (user) {
    await deleteLocalAccountData(user.id);
  }

  return {
    clerkDeleted: true,
    databaseDeleted: Boolean(user),
    userId: user?.id ?? null,
  };
}
