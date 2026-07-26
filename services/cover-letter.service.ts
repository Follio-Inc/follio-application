/**
 * Cover letter unlisted-key helpers (owner operations).
 */

import crypto from 'crypto';

import { db } from '@/lib/db';

function newUnlistedKey(): string {
  return crypto.randomBytes(16).toString('hex');
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
