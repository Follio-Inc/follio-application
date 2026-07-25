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
 * Onboarding is complete when the Clerk user owns at least one Profile.
 * A Clerk account alone (or a User row without a Profile) is incomplete.
 */
export async function hasOnboardedProfile(clerkId: string): Promise<boolean> {
  return (await resolveActiveProfileContextOrNull(clerkId)) !== null;
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

export interface MakePortfolioReadyOptions {
  /**
   * When true and no portfolio exists yet, run the full AI pipeline (copy +
   * portfolio-style content transform). Used when the user explicitly assigns
   * a resume as their portfolio. Defaults to false for fast, idempotent paths
   * (dashboard load, resume deletion fallback).
   */
  useAI?: boolean;
}

/**
 * Make a profile fully usable as the user's portfolio.
 *
 * The public portfolio surface (`/u/[handle]`) only renders when the profile is
 * out of `DRAFT` and has an active, template-based `GeneratedPortfolio`. New and
 * cloned resumes have neither, so simply pointing `primaryProfile` at one would
 * yield a "portfolio not found" page. This helper closes that gap and is safe to
 * call repeatedly — it is a no-op once the profile is already portfolio-ready.
 *
 * It performs two idempotent steps:
 *   1. Promote `status` out of `DRAFT` (to `PUBLIC`) so the page stops 404ing.
 *      `PRIVATE`/`PUBLIC` are left untouched to respect an explicit user choice.
 *   2. Ensure an active template-based portfolio exists, generating one when
 *      missing. Generation snapshots resume data into portfolio-owned content.
 */
export async function makeProfilePortfolioReady(
  profileId: string,
  options: MakePortfolioReadyOptions = {}
): Promise<void> {
  // Resume-only mode: skip portfolio generation entirely. Callers may still
  // promote a primary profile pointer; public portfolio is gated elsewhere.
  const { isPortfolioEnabled } = await import('@/lib/features');
  if (!isPortfolioEnabled()) {
    return;
  }

  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { status: true },
  });

  if (!profile) {
    throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
  }

  if (profile.status === 'DRAFT') {
    await db.profile.update({
      where: { id: profileId },
      data: { status: 'PUBLIC' },
    });
  }

  // Imported lazily to avoid pulling the AI-generation module (and its heavy
  // dependency graph) into every consumer of the active-profile helpers.
  const { ensureActiveTemplatePortfolio } =
    await import('@/services/portfolio/enhanced-generation.service');
  await ensureActiveTemplatePortfolio(profileId, { skipAI: !options.useAI });
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
