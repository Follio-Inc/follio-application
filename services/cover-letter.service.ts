/**
 * Cover letter ownership + unlisted-key helpers.
 */

import crypto from 'crypto';

import type { CoverLetter, Prisma } from '@prisma/client';

import { db } from '@/lib/db';

function newUnlistedKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function getUserIdByClerkId(clerkId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Find a cover letter owned by `userId`.
 * By default excludes archived letters.
 */
export async function findOwnedCoverLetter(
  userId: string,
  id: string,
  options: { includeArchived?: boolean } = {}
): Promise<CoverLetter | null> {
  return db.coverLetter.findFirst({
    where: {
      id,
      userId,
      ...(options.includeArchived ? {} : { isArchived: false }),
    },
  });
}

/**
 * Resolve owner user + non-archived letter in one hop (API route helper).
 */
export async function resolveOwnedCoverLetter(
  clerkId: string,
  id: string
): Promise<{ userId: string; letter: CoverLetter } | { userId: null; letter: null }> {
  const userId = await getUserIdByClerkId(clerkId);
  if (!userId) return { userId: null, letter: null };

  const letter = await findOwnedCoverLetter(userId, id);
  if (!letter) return { userId: null, letter: null };

  return { userId, letter };
}

/**
 * Resolve owner + letter with a narrow select (avoids loading full JSON blobs).
 */
export async function resolveOwnedCoverLetterSelect<T extends Prisma.CoverLetterSelect>(
  clerkId: string,
  id: string,
  select: T
): Promise<{
  userId: string;
  letter: Prisma.CoverLetterGetPayload<{ select: T }> | null;
} | null> {
  const userId = await getUserIdByClerkId(clerkId);
  if (!userId) return null;

  const letter = await db.coverLetter.findFirst({
    where: { id, userId, isArchived: false },
    select,
  });

  return { userId, letter };
}

/** Set this letter as the user's sole active cover letter. */
export async function setActiveCoverLetter(userId: string, coverLetterId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.coverLetter.updateMany({
      where: { userId, activeForUserId: userId },
      data: { activeForUserId: null },
    });
    await tx.coverLetter.update({
      where: { id: coverLetterId },
      data: { activeForUserId: userId },
    });
  });
}

/**
 * Get or create an unlisted key for a cover letter owned by `userId`.
 */
export async function getOrCreateCoverLetterUnlistedKey(
  coverLetterId: string,
  userId: string
): Promise<string | null> {
  const letter = await db.coverLetter.findFirst({
    where: { id: coverLetterId, userId, isArchived: false },
    select: { unlistedKey: true },
  });
  if (!letter) return null;
  if (letter.unlistedKey) return letter.unlistedKey;

  const updated = await db.coverLetter.update({
    where: { id: coverLetterId },
    data: { unlistedKey: newUnlistedKey() },
    select: { unlistedKey: true },
  });
  return updated.unlistedKey!;
}

/**
 * Regenerate the unlisted key (invalidates prior /cl/{key} links).
 */
export async function regenerateCoverLetterUnlistedKey(
  coverLetterId: string,
  userId: string
): Promise<string | null> {
  const letter = await db.coverLetter.findFirst({
    where: { id: coverLetterId, userId, isArchived: false },
    select: { id: true },
  });
  if (!letter) return null;

  const updated = await db.coverLetter.update({
    where: { id: coverLetterId },
    data: { unlistedKey: newUnlistedKey() },
    select: { unlistedKey: true },
  });
  return updated.unlistedKey!;
}
