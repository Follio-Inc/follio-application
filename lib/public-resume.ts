/**
 * Public / unlisted resume URL and exclusivity helpers.
 *
 * Product rules:
 * - At most one PUBLIC resume per user.
 * - Public share URL is vanity: follio.me/{username} (no /u, no /resume).
 * - Unlisted share URL is opaque: follio.me/r/{unlistedKey} (no username).
 */

import { cache } from 'react';

import { db } from '@/lib/db';
import { isReservedUsername } from '@/lib/reserved-usernames';
import { applyVisibilityFilter } from '@/lib/visibility';
import type { ContentVisibility, PublicProfile } from '@/types';

export type ReplacedPublicResume = {
  id: string;
  resumeTitle: string;
  handle: string;
};

/**
 * Resolve the vanity username used in public resume URLs for a user.
 * Prefers the primary (portfolio) profile handle, else the oldest profile.
 */
export async function getVanityUsernameForUser(userId: string): Promise<string | null> {
  const primary = await db.profile.findFirst({
    where: { primaryForUserId: userId, isArchived: false },
    select: { handle: true },
  });
  if (primary?.handle) return primary.handle;

  const oldest = await db.profile.findFirst({
    where: { userId, isArchived: false },
    orderBy: { createdAt: 'asc' },
    select: { handle: true },
  });
  return oldest?.handle ?? null;
}

/**
 * Find the single public resume for the user who owns `username`, if any.
 */
export const resolvePublicResumeByUsername = cache(
  async (username: string): Promise<{ profile: PublicProfile; vanityUsername: string } | null> => {
    const normalized = username.trim().toLowerCase();
    if (!normalized || isReservedUsername(normalized)) return null;

    const handleProfile = await db.profile.findFirst({
      where: { handle: normalized, isArchived: false },
      select: { userId: true },
    });
    if (!handleProfile) return null;

    const publicRow = await db.profile.findFirst({
      where: {
        userId: handleProfile.userId,
        resumeVisibility: 'PUBLIC',
        isArchived: false,
      },
      select: { handle: true },
    });
    if (!publicRow) return null;

    const vanityUsername =
      (await getVanityUsernameForUser(handleProfile.userId)) ?? publicRow.handle;

    const profile = await getPublicProfileByHandle(publicRow.handle);
    if (!profile) return null;

    return { profile, vanityUsername };
  }
);

/**
 * Resolve an unlisted resume by opaque key alone (no username in the URL).
 */
export const resolveResumeByUnlistedKey = cache(
  async (key: string): Promise<PublicProfile | null> => {
    const trimmed = key.trim();
    if (!trimmed) return null;

    const row = await db.profile.findFirst({
      where: {
        unlistedKey: trimmed,
        isArchived: false,
        resumeVisibility: { in: ['UNLISTED', 'PUBLIC'] },
      },
      select: { handle: true, resumeVisibility: true },
    });

    // Opaque links are for unlisted access. If the resume was later made
    // public, still allow the key so old links do not break — but prefer
    // that owners share the vanity URL going forward.
    if (!row) return null;

    return getPublicProfileByHandle(row.handle);
  }
);

async function getPublicProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const profile = await db.profile.findUnique({
    where: { handle },
    include: {
      contactInfo: true,
      links: { orderBy: { sortOrder: 'asc' } },
      workExperiences: { orderBy: { sortOrder: 'asc' } },
      educations: { orderBy: { sortOrder: 'asc' } },
      skills: { orderBy: { sortOrder: 'asc' } },
      skillGroups: {
        include: { skills: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      projects: { orderBy: { sortOrder: 'asc' } },
      awards: { orderBy: { sortOrder: 'asc' } },
      certifications: { orderBy: { sortOrder: 'asc' } },
      blogPosts: { orderBy: { createdAt: 'desc' } },
      youtubeVideos: { orderBy: { createdAt: 'desc' } },
      photos: { orderBy: { sortOrder: 'asc' } },
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) return null;

  const publicContactInfo = profile.contactInfo
    ? {
        email: profile.contactInfo.emailPublic ? profile.contactInfo.email : null,
        phone: profile.contactInfo.phonePublic ? profile.contactInfo.phone : null,
        website: profile.contactInfo.website,
        headerFieldsOrder: Array.isArray(profile.contactInfo.headerFieldsOrder)
          ? (profile.contactInfo.headerFieldsOrder as string[])
          : null,
      }
    : null;

  // Strip owner id before returning a public payload.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional omit
  const { userId, ...publicProfile } = profile;

  return applyVisibilityFilter({
    ...publicProfile,
    contactInfo: publicContactInfo,
  } as PublicProfile) as PublicProfile;
}

/**
 * Set resume visibility. When setting PUBLIC, demote any other PUBLIC resume
 * for the same user to UNLISTED so only one public resume exists.
 */
export async function setExclusiveResumeVisibility(
  profileId: string,
  visibility: ContentVisibility
): Promise<{ replacedPublicResume: ReplacedPublicResume | null }> {
  if (visibility !== 'PUBLIC') {
    await db.profile.update({
      where: { id: profileId },
      data: { resumeVisibility: visibility },
    });
    return { replacedPublicResume: null };
  }

  return db.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { id: profileId },
      select: { id: true, userId: true, isArchived: true },
    });

    if (!profile || profile.isArchived) {
      throw new Error('Profile not found');
    }

    const existingPublic = await tx.profile.findFirst({
      where: {
        userId: profile.userId,
        resumeVisibility: 'PUBLIC',
        isArchived: false,
        id: { not: profileId },
      },
      select: { id: true, resumeTitle: true, handle: true },
    });

    if (existingPublic) {
      await tx.profile.update({
        where: { id: existingPublic.id },
        data: { resumeVisibility: 'UNLISTED' },
      });
    }

    await tx.profile.update({
      where: { id: profileId },
      data: { resumeVisibility: 'PUBLIC' },
    });

    return {
      replacedPublicResume: existingPublic
        ? {
            id: existingPublic.id,
            resumeTitle: existingPublic.resumeTitle,
            handle: existingPublic.handle,
          }
        : null,
    };
  });
}

/**
 * Find another public resume owned by the same user (for confirmation UI).
 */
export async function findOtherPublicResume(
  userId: string,
  excludeProfileId: string
): Promise<ReplacedPublicResume | null> {
  const existing = await db.profile.findFirst({
    where: {
      userId,
      resumeVisibility: 'PUBLIC',
      isArchived: false,
      id: { not: excludeProfileId },
    },
    select: { id: true, resumeTitle: true, handle: true },
  });
  return existing;
}
