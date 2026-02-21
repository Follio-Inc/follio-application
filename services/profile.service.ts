/**
 * Profile Service
 * Business logic for profile operations
 */

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { applyVisibilityFilter } from '@/lib/visibility';
import type { ContentVisibility, FullProfile, PublicProfile } from '@/types';
import crypto from 'crypto';

const profileLogger = logger.child({ source: 'profile-service' });

/**
 * Get a full profile by handle with all relations
 */
export async function getProfileByHandle(handle: string): Promise<FullProfile | null> {
  try {
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

    return profile as FullProfile | null;
  } catch (error) {
    profileLogger.error('Failed to fetch profile by handle', error, { handle });
    throw Errors.internal('Failed to load profile');
  }
}

/**
 * Get a public profile by handle (excludes sensitive data)
 * Filters out hidden sections and their associated content
 */
export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
  try {
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

    // Filter contact info for public view (emailPublic/phonePublic are
    // server-only access-control flags that should be stripped before
    // applying the generic visibility filter).
    const publicContactInfo = profile.contactInfo
      ? {
          email: profile.contactInfo.emailPublic ? profile.contactInfo.email : null,
          phone: profile.contactInfo.phonePublic ? profile.contactInfo.phone : null,
          website: profile.contactInfo.website,
        }
      : null;

    // Remove userId from the response
    const { userId, ...publicProfile } = profile;

    // Apply centralized visibility filter (shared with client-side views)
    // This handles both section-level AND entry-level isVisible filtering.
    const filtered = applyVisibilityFilter({
      ...publicProfile,
      contactInfo: publicContactInfo,
    } as PublicProfile);

    return filtered as PublicProfile;
  } catch (error) {
    profileLogger.error('Failed to fetch public profile', error, { handle });
    throw Errors.internal('Failed to load public profile');
  }
}

/**
 * Check if a handle is available
 */
export async function isHandleAvailable(
  handle: string,
  excludeProfileId?: string
): Promise<boolean> {
  const existing = await db.profile.findUnique({
    where: { handle },
    select: { id: true },
  });

  if (!existing) return true;
  if (excludeProfileId && existing.id === excludeProfileId) return true;

  return false;
}

/**
 * Update profile status (draft/public/private)
 */
export async function updateProfileStatus(
  profileId: string,
  status: 'DRAFT' | 'PUBLIC' | 'PRIVATE'
): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: {
      status,
      publishedAt: status === 'PUBLIC' ? new Date() : undefined,
    },
  });
}

/**
 * Update resume visibility (PUBLIC, UNLISTED, or PRIVATE)
 */
export async function updateResumeVisibility(
  profileId: string,
  visibility: ContentVisibility
): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: { resumeVisibility: visibility },
  });
}

/**
 * Update portfolio visibility (PUBLIC, UNLISTED, or PRIVATE)
 */
export async function updatePortfolioVisibility(
  profileId: string,
  visibility: ContentVisibility
): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: { portfolioVisibility: visibility },
  });
}

/**
 * Get resume visibility for a profile
 */
export async function getResumeVisibility(handle: string): Promise<ContentVisibility | null> {
  const profile = await db.profile.findUnique({
    where: { handle },
    select: { resumeVisibility: true },
  });
  return profile?.resumeVisibility ?? null;
}

/**
 * Get portfolio visibility for a profile
 */
export async function getPortfolioVisibility(handle: string): Promise<ContentVisibility | null> {
  const profile = await db.profile.findUnique({
    where: { handle },
    select: { portfolioVisibility: true },
  });
  return profile?.portfolioVisibility ?? null;
}

/**
 * Update links visibility (PUBLIC, UNLISTED, or PRIVATE)
 */
export async function updateLinksVisibility(
  profileId: string,
  visibility: ContentVisibility
): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: { linksVisibility: visibility },
  });
}

/**
 * Get links visibility for a profile
 */
export async function getLinksVisibility(handle: string): Promise<ContentVisibility | null> {
  const profile = await db.profile.findUnique({
    where: { handle },
    select: { linksVisibility: true },
  });
  return profile?.linksVisibility ?? null;
}

/**
 * Get profile statistics
 */
export async function getProfileStats(profileId: string) {
  const [workCount, projectCount, skillCount, educationCount] = await Promise.all([
    db.workExperience.count({ where: { profileId } }),
    db.project.count({ where: { profileId } }),
    db.skill.count({ where: { profileId } }),
    db.education.count({ where: { profileId } }),
  ]);

  return {
    workExperiences: workCount,
    projects: projectCount,
    skills: skillCount,
    educations: educationCount,
  };
}

/**
 * Validate an unlisted key for a profile
 * Returns true if the key matches the profile's unlisted key
 */
export async function validateUnlistedKey(handle: string, key: string): Promise<boolean> {
  if (!key) return false;

  const profile = await db.profile.findUnique({
    where: { handle },
    select: { unlistedKey: true },
  });

  if (!profile?.unlistedKey) return false;
  return profile.unlistedKey === key;
}

/**
 * Get or create an unlisted key for a profile
 */
export async function getOrCreateUnlistedKey(profileId: string): Promise<string> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { unlistedKey: true },
  });

  if (profile?.unlistedKey) return profile.unlistedKey;

  // Generate a new key using cuid (via Prisma default)
  const updated = await db.profile.update({
    where: { id: profileId },
    data: { unlistedKey: crypto.randomBytes(16).toString('hex') },
    select: { unlistedKey: true },
  });

  return updated.unlistedKey!;
}

/**
 * Regenerate the unlisted key for a profile (invalidates old links)
 */
export async function regenerateUnlistedKey(profileId: string): Promise<string> {
  const updated = await db.profile.update({
    where: { id: profileId },
    data: { unlistedKey: crypto.randomBytes(16).toString('hex') },
    select: { unlistedKey: true },
  });

  return updated.unlistedKey!;
}

/**
 * Get the unlisted key for a profile (owner only)
 */
export async function getUnlistedKey(profileId: string): Promise<string | null> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    select: { unlistedKey: true },
  });

  return profile?.unlistedKey ?? null;
}
