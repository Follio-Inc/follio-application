/**
 * Profile Service
 * Business logic for profile operations
 */

import { db } from '@/lib/db';
import type { FullProfile, PublicProfile } from '@/types';

/**
 * Get a full profile by handle with all relations
 */
export async function getProfileByHandle(handle: string): Promise<FullProfile | null> {
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
    },
  });

  return profile as FullProfile | null;
}

/**
 * Get a public profile by handle (excludes sensitive data)
 * Filters out hidden sections and their associated content
 */
export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
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
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) return null;

  // Get visible sections
  const visibleSections = profile.sections.filter((s) => s.isVisible);
  const visibleSectionTypes = new Set(visibleSections.map((s) => s.type));

  // Filter contact info for public view
  const publicContactInfo = profile.contactInfo
    ? {
        email: profile.contactInfo.emailPublic ? profile.contactInfo.email : null,
        website: profile.contactInfo.website,
      }
    : null;

  // Remove userId from the response
  const { userId, ...publicProfile } = profile;

  // Check if BASIC_INFO is visible - if hidden, nullify personal details
  const showBasicInfo = visibleSectionTypes.has('BASIC_INFO');

  // Filter content based on visible sections
  return {
    ...publicProfile,
    // Basic info fields - hide if BASIC_INFO section is hidden
    firstName: showBasicInfo ? profile.firstName : null,
    lastName: showBasicInfo ? profile.lastName : null,
    headline: showBasicInfo ? profile.headline : null,
    summary: showBasicInfo ? profile.summary : null,
    avatarUrl: showBasicInfo ? profile.avatarUrl : null,
    location: showBasicInfo ? profile.location : null,
    contactInfo: showBasicInfo ? publicContactInfo : null,
    sections: visibleSections,
    // Only include content if the corresponding section is visible
    workExperiences: visibleSectionTypes.has('EXPERIENCE') ? profile.workExperiences : [],
    educations: visibleSectionTypes.has('EDUCATION') ? profile.educations : [],
    skills: visibleSectionTypes.has('SKILLS') ? profile.skills : [],
    skillGroups: visibleSectionTypes.has('SKILLS') ? profile.skillGroups : [],
    projects: visibleSectionTypes.has('PROJECTS') ? profile.projects : [],
    links: visibleSectionTypes.has('LINKS') ? profile.links : [],
    awards: visibleSectionTypes.has('AWARDS') ? profile.awards : [],
    certifications: visibleSectionTypes.has('CERTIFICATIONS') ? profile.certifications : [],
  } as PublicProfile;
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
