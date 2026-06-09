import type { Prisma } from '@prisma/client';

import { db } from '@/lib/db';
import { AppError, ErrorCode, isAppError } from '@/lib/errors';

interface ActiveProfileContext {
  userId: string;
  profileId: string;
}

/**
 * A Prisma client capable of running the queries used by the primary-profile
 * helpers. Both the top-level `db` client and a transaction client satisfy it.
 */
type ProfileWriteClient = Pick<Prisma.TransactionClient, 'profile' | 'user'>;

export async function resolveActiveProfileContext(clerkId: string): Promise<ActiveProfileContext> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      profile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError('User not found', ErrorCode.NOT_FOUND, 404);
  }

  if (user.profile?.id) {
    return { userId: user.id, profileId: user.profile.id };
  }

  const fallback = await db.profile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!fallback) {
    throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      profile: {
        connect: { id: fallback.id },
      },
    },
  });

  return { userId: user.id, profileId: fallback.id };
}

export async function resolveActiveProfileContextOrNull(
  clerkId: string
): Promise<ActiveProfileContext | null> {
  try {
    return await resolveActiveProfileContext(clerkId);
  } catch (error) {
    if (isAppError(error) && error.code === ErrorCode.NOT_FOUND) {
      return null;
    }

    throw error;
  }
}

/**
 * Ensure the user has a stable "primary" (portfolio) profile.
 *
 * The primary profile backs the user-facing Portfolio surface and must remain
 * stable when other resumes are created, edited, or activated. This helper only
 * assigns a primary when none exists yet — it never overrides an existing
 * choice. When unset, it prefers the user's active profile, falling back to the
 * oldest profile.
 *
 * @returns the resolved primary profile id, or `null` if the user has no
 *   profiles at all.
 */
export async function ensurePrimaryProfile(
  client: ProfileWriteClient,
  userId: string,
  preferredProfileId?: string
): Promise<string | null> {
  const existingPrimary = await client.profile.findFirst({
    where: { primaryForUserId: userId },
    select: { id: true },
  });

  if (existingPrimary) {
    return existingPrimary.id;
  }

  let candidateId = preferredProfileId ?? null;

  if (!candidateId) {
    const activeProfile = await client.profile.findFirst({
      where: { activeForUserId: userId },
      select: { id: true },
    });
    candidateId = activeProfile?.id ?? null;
  }

  if (!candidateId) {
    const oldestProfile = await client.profile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    candidateId = oldestProfile?.id ?? null;
  }

  if (!candidateId) {
    return null;
  }

  await client.user.update({
    where: { id: userId },
    data: {
      primaryProfile: {
        connect: { id: candidateId },
      },
    },
  });

  return candidateId;
}

/**
 * Resolve the user's primary (portfolio) profile, lazily assigning one when the
 * user has profiles but no primary yet.
 *
 * @throws AppError(NOT_FOUND) when the user or any profile is missing.
 */
export async function resolvePrimaryProfileContext(clerkId: string): Promise<ActiveProfileContext> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      primaryProfile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError('User not found', ErrorCode.NOT_FOUND, 404);
  }

  if (user.primaryProfile?.id) {
    return { userId: user.id, profileId: user.primaryProfile.id };
  }

  const primaryProfileId = await ensurePrimaryProfile(db, user.id);

  if (!primaryProfileId) {
    throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
  }

  return { userId: user.id, profileId: primaryProfileId };
}

export async function resolvePrimaryProfileContextOrNull(
  clerkId: string
): Promise<ActiveProfileContext | null> {
  try {
    return await resolvePrimaryProfileContext(clerkId);
  } catch (error) {
    if (isAppError(error) && error.code === ErrorCode.NOT_FOUND) {
      return null;
    }

    throw error;
  }
}
