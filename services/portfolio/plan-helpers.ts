/**
 * Shared helpers for portfolio plan assembly — profile loading, section
 * derivation, and resolving the editor's working plan (draft vs published).
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getDraftPlan } from '@/lib/portfolio/templates/overrides';
import { normalizeProfileForTemplate } from '@/lib/portfolio/templates/normalizer';

import type {
  TemplateAIEnrichment,
  TemplatePortfolio,
  TemplateProfileData,
  TemplateSectionConfig,
} from '@/lib/portfolio/templates/types';
import type { FullProfile } from '@/types';

const helpersLogger = logger.child({ source: 'portfolio-plan-helpers' });

// ============================================================================
// WORKING PLAN RESOLUTION
// ============================================================================

/**
 * Resolve the portfolio plan the user is actively working with.
 *
 * Priority: explicit client draft → saved editor draft → published plan.
 * Used by template switch and regeneration so unpublished edits are not lost.
 */
export function resolveWorkingPlan(
  publishedPlan: TemplatePortfolio | null | undefined,
  userOverrides: unknown,
  clientPlan?: TemplatePortfolio | null
): TemplatePortfolio | null {
  if (clientPlan && typeof clientPlan.templateId === 'string' && clientPlan.copy) {
    return clientPlan;
  }
  const savedDraft = getDraftPlan(userOverrides);
  if (savedDraft) return savedDraft;
  if (publishedPlan && typeof publishedPlan.templateId === 'string' && publishedPlan.copy) {
    return publishedPlan;
  }
  return null;
}

// ============================================================================
// PROFILE LOADING
// ============================================================================

export async function loadProfileWithRelations(profileId: string): Promise<FullProfile | null> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
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
}

export async function loadGithubProfile(profileId: string) {
  try {
    return await db.gitHubProfile.findUnique({
      where: { profileId },
      select: {
        username: true,
        avatarUrl: true,
        bio: true,
        publicRepos: true,
        followers: true,
        totalStars: true,
        primaryLanguages: true,
      },
    });
  } catch {
    helpersLogger.warn('Failed to fetch GitHub profile, continuing without it', { profileId });
    return null;
  }
}

export async function loadNormalizedProfile(
  profileId: string
): Promise<TemplateProfileData | null> {
  const profile = await loadProfileWithRelations(profileId);
  if (!profile) return null;

  const githubProfile = await loadGithubProfile(profileId);
  const serialized = JSON.parse(JSON.stringify(profile));
  return normalizeProfileForTemplate(serialized, {
    githubProfile: githubProfile ? JSON.parse(JSON.stringify(githubProfile)) : null,
  });
}

// ============================================================================
// SECTION DETERMINATION
// ============================================================================

/**
 * Determine which sections to enable based on available profile data.
 * Sections without data are disabled by default.
 */
export function determineSections(
  profile: TemplateProfileData,
  defaults: TemplateSectionConfig[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _enrichment?: TemplateAIEnrichment | null
): TemplateSectionConfig[] {
  return defaults.map((section) => {
    if (section.type === 'navigation' || section.type === 'footer') {
      return { ...section, enabled: true };
    }

    if (section.type === 'hero' || section.type === 'about' || section.type === 'contact') {
      return { ...section, enabled: true };
    }

    const hasData = sectionHasData(section.type, profile);
    return { ...section, enabled: hasData };
  });
}

export function sectionHasData(type: string, profile: TemplateProfileData): boolean {
  switch (type) {
    case 'experience':
      return profile.workExperiences.filter((e) => e.isVisible).length > 0;
    case 'projects':
      return profile.projects.filter((p) => p.isVisible && p.showOnPortfolio).length > 0;
    case 'skills':
      return profile.skills.filter((s) => s.isVisible).length > 0 || profile.skillGroups.length > 0;
    case 'education':
      return profile.educations.filter((e) => e.isVisible).length > 0;
    case 'certifications':
      return profile.certifications.filter((c) => c.isVisible).length > 0;
    case 'awards':
      return profile.awards.filter((a) => a.isVisible).length > 0;
    case 'github':
      return profile.github !== null;
    case 'blog':
      return profile.blogPosts.filter((b) => b.isVisible).length > 0;
    default:
      return false;
  }
}
