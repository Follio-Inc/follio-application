/**
 * Profile Data Normalizer
 *
 * Converts a PublicProfile (Prisma + serialized) into the clean,
 * serializable TemplateProfileData contract that templates consume.
 *
 * Why normalize?
 * - Templates shouldn't depend on Prisma types or know about DB internals
 * - Dates are already serialized to strings by the time they reach the client
 * - Field names differ between Prisma model and template contract
 *   (e.g. `companyLogo` → `companyLogoUrl`, `githubStars` → `ghStars`)
 * - Visibility filtering is applied during normalization
 */

import type { PublicProfile } from '@/types';

import type { TemplateProfileData } from './types';

/**
 * GitHub profile data, optionally passed in if fetched separately.
 * Mirrors the Prisma GitHubProfile model (serialized).
 */
interface GitHubProfileData {
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  publicRepos: number;
  followers: number;
  totalStars: number;
  primaryLanguages: string[];
}

interface NormalizeOptions {
  /** GitHub profile data if fetched separately from the profile query */
  githubProfile?: GitHubProfileData | null;
}

/**
 * Normalize a PublicProfile into TemplateProfileData.
 *
 * By the time this runs, the profile has already been:
 * 1. Fetched from DB via getPublicProfile()
 * 2. Visibility-filtered (only visible entries)
 * 3. Serialized via JSON.parse(JSON.stringify()) → all Dates are ISO strings
 */
export function normalizeProfileForTemplate(
  profile: PublicProfile,
  options: NormalizeOptions = {}
): TemplateProfileData {
  const { githubProfile = null } = options;

  return {
    id: profile.id,
    handle: profile.handle,
    firstName: profile.firstName ?? null,
    middleName: profile.middleName ?? null,
    lastName: profile.lastName ?? null,
    headline: profile.headline ?? null,
    summary: profile.summary ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    location: profile.location ?? null,

    contactInfo: profile.contactInfo
      ? {
          email: profile.contactInfo.email ?? null,
          phone: profile.contactInfo.phone ?? null,
          website: profile.contactInfo.website ?? null,
        }
      : null,

    links: (profile.links ?? []).map((link) => ({
      id: link.id,
      type: String(link.type),
      url: link.url,
      label: link.label ?? null,
    })),

    workExperiences: (profile.workExperiences ?? []).map((exp) => ({
      id: exp.id,
      company: exp.company,
      companyLogoUrl: ((exp as Record<string, unknown>).companyLogo as string | null) ?? null,
      role: exp.role,
      location: exp.location ?? null,
      startDate: toDateString(exp.startDate),
      endDate: toDateString(exp.endDate),
      isCurrent: exp.isCurrent,
      bullets: exp.bullets ?? [],
      isVisible: exp.isVisible,
    })),

    educations: (profile.educations ?? []).map((edu) => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree ?? null,
      fieldOfStudy: edu.fieldOfStudy ?? null,
      startDate: toDateString(edu.startDate),
      endDate: toDateString(edu.endDate),
      isCurrent: edu.isCurrent,
      gpa: edu.gpa ?? null,
      isVisible: edu.isVisible,
    })),

    skills: (profile.skills ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name,
      level: skill.level ? String(skill.level) : null,
      groupId: skill.groupId ?? null,
      isVisible: skill.isVisible,
    })),

    skillGroups: (profile.skillGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      skills: (group.skills ?? []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        level: skill.level ? String(skill.level) : null,
      })),
    })),

    projects: (profile.projects ?? []).map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description ?? null,
      url: project.url ?? null,
      repoUrl: project.repoUrl ?? null,
      imageUrl: project.imageUrl ?? null,
      techStack: project.techStack ?? [],
      isVisible: project.isVisible,
      showOnPortfolio: ((project as Record<string, unknown>).showOnPortfolio as boolean) ?? true,
      ghStars: ((project as Record<string, unknown>).githubStars as number | null) ?? null,
      ghForks: ((project as Record<string, unknown>).githubForks as number | null) ?? null,
      ghLanguage: ((project as Record<string, unknown>).githubLanguage as string | null) ?? null,
    })),

    certifications: (profile.certifications ?? []).map((cert) => ({
      id: cert.id,
      name: cert.name,
      issuer: cert.issuer,
      issueDate: toDateString(cert.issueDate),
      credentialUrl: cert.credentialUrl ?? null,
      isVisible: cert.isVisible,
    })),

    awards: (profile.awards ?? []).map((award) => ({
      id: award.id,
      title: award.title,
      issuer: award.issuer ?? null,
      date: toDateString(award.date),
      description: award.description ?? null,
      isVisible: award.isVisible,
    })),

    blogPosts: (profile.blogPosts ?? []).map((post) => ({
      id: post.id,
      title: post.title,
      url: post.url,
      excerpt: post.excerpt ?? null,
      thumbnail: post.thumbnail ?? null,
      publishedAt: toDateString(post.publishedAt),
      platform: post.platform ?? null,
      isVisible: post.isVisible,
    })),

    photos: (profile.photos ?? []).map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption ?? null,
      category: String(photo.category),
    })),

    github: githubProfile
      ? {
          username: githubProfile.username,
          avatarUrl: githubProfile.avatarUrl ?? null,
          bio: githubProfile.bio ?? null,
          publicRepos: githubProfile.publicRepos,
          followers: githubProfile.followers,
          totalStars: githubProfile.totalStars,
          primaryLanguages: githubProfile.primaryLanguages ?? [],
        }
      : null,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert a value (Date, ISO string, or null) to a date string or null.
 * By the time this runs, Dates are already serialized to ISO strings
 * via serializeForClient, so this is largely a type-narrowing pass.
 */
function toDateString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}
