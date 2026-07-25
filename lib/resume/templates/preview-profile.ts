/**
 * Resume template preview profile resolution.
 *
 * Two policies, one place:
 * - TEMPLATE_PREVIEW_ON_CREATE (`sample-when-sparse`): first template pick after
 *   upload/blank (onboarding, dashboard, builder new-resume). Falls back to the
 *   archetype sample when the draft is not yet “good enough”.
 * - TEMPLATE_PREVIEW_IN_BUILDER (`always-user`): changing templates inside the
 *   builder Design panel. Always the live draft — never swap in sample data.
 */

import { parseCommaSeparatedSkills } from '@/lib/skills/groups';
import type { PublicProfile, ResumeDesign } from '@/types';
import { RESUME_DESIGN_DEFAULTS } from '@/types';

import { buildResumePreviewSections, RESUME_TEMPLATE_SAMPLE_PROFILE } from './sample-profile';

/** How template previews choose content. */
export type ResumeTemplatePreviewDataPolicy =
  /** Always use the provided profile (builder Design panel). */
  | 'always-user'
  /**
   * Use user content only when the draft is “good enough” for a first impression;
   * otherwise show the archetype sample (upload/blank creation flows).
   */
  | 'sample-when-sparse';

/**
 * First-time template pick (upload / blank anywhere).
 * May show sample content when Name, Email, Experience, Education, or Skills are missing.
 */
export const TEMPLATE_PREVIEW_ON_CREATE: ResumeTemplatePreviewDataPolicy = 'sample-when-sparse';

/**
 * Switching templates inside the builder. Always the user’s live draft.
 * Do not use TEMPLATE_PREVIEW_ON_CREATE here.
 */
export const TEMPLATE_PREVIEW_IN_BUILDER: ResumeTemplatePreviewDataPolicy = 'always-user';

/** Minimal shape for sufficiency checks (builder profile or onboarding draft). */
export interface ResumePreviewSufficiencyInput {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  /** Convenience for drafts that store email outside `contactInfo`. */
  email?: string | null;
  contactInfo?: { email?: string | null } | null;
  workExperiences?: readonly unknown[] | null;
  /** Onboarding build page uses `experiences`; builder uses `workExperiences`. */
  experiences?: readonly unknown[] | null;
  educations?: readonly unknown[] | null;
  skills?: readonly unknown[] | null;
  skillGroups?:
    | readonly {
        skills?: readonly unknown[] | null;
        skillsText?: string | null;
      }[]
    | null;
}

function hasDisplayName(input: ResumePreviewSufficiencyInput): boolean {
  return Boolean(input.firstName?.trim() || input.middleName?.trim() || input.lastName?.trim());
}

function hasEmail(input: ResumePreviewSufficiencyInput): boolean {
  const email = input.contactInfo?.email ?? input.email;
  return Boolean(email?.trim());
}

function countSkills(input: ResumePreviewSufficiencyInput): number {
  const flat = input.skills?.length ?? 0;
  const fromGroups = (input.skillGroups ?? []).reduce((total, group) => {
    if (Array.isArray(group.skills) && group.skills.length > 0) {
      // String[] from normalizeSkillGroups, or Skill[] from PublicProfile
      return total + group.skills.length;
    }
    if (typeof group.skillsText === 'string' && group.skillsText.trim()) {
      return total + parseCommaSeparatedSkills(group.skillsText).length;
    }
    return total;
  }, 0);
  return flat + fromGroups;
}

/**
 * True when Follio should preview templates with the user’s own data.
 *
 * Requires Name, Email, ≥1 Experience, ≥1 Education, and ≥1 Skill.
 * Used only with TEMPLATE_PREVIEW_ON_CREATE — never for builder template switches.
 */
export function hasSufficientResumePreviewData(input: ResumePreviewSufficiencyInput): boolean {
  const hasExperience =
    (input.workExperiences?.length ?? 0) > 0 || (input.experiences?.length ?? 0) > 0;
  const hasEducation = (input.educations?.length ?? 0) > 0;
  return (
    hasDisplayName(input) &&
    hasEmail(input) &&
    hasExperience &&
    hasEducation &&
    countSkills(input) > 0
  );
}

/**
 * Resolve which profile to render inside the shared template gallery.
 * Prefer TEMPLATE_PREVIEW_IN_BUILDER (default) so sparse drafts still show as-is.
 */
export function resolveResumeTemplatePreviewProfile(
  userProfile: PublicProfile,
  policy: ResumeTemplatePreviewDataPolicy = TEMPLATE_PREVIEW_IN_BUILDER
): PublicProfile {
  if (policy === TEMPLATE_PREVIEW_IN_BUILDER) return userProfile;
  if (hasSufficientResumePreviewData(userProfile)) return userProfile;
  return RESUME_TEMPLATE_SAMPLE_PROFILE;
}

export function isUsingSampleResumePreview(
  userProfile: PublicProfile,
  policy: ResumeTemplatePreviewDataPolicy = TEMPLATE_PREVIEW_IN_BUILDER
): boolean {
  return policy === TEMPLATE_PREVIEW_ON_CREATE && !hasSufficientResumePreviewData(userProfile);
}

/**
 * Empty draft for blank-resume template picks.
 * Resolves to the archetype sample under TEMPLATE_PREVIEW_ON_CREATE.
 */
export function buildSparseResumePreviewProfile(): PublicProfile {
  return {
    ...RESUME_TEMPLATE_SAMPLE_PROFILE,
    firstName: null,
    middleName: null,
    lastName: null,
    headline: null,
    summary: null,
    avatarUrl: null,
    contactInfo: { email: null, phone: null, website: null },
    workExperiences: [],
    educations: [],
    skills: [],
    skillGroups: [],
    projects: [],
    links: [],
  } as PublicProfile;
}

/** Loose onboarding draft → PublicProfile for live template previews. */
export interface OnboardingResumePreviewDraft {
  profile: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    headline?: string | null;
    summary?: string | null;
    location?: string | null;
    avatarUrl?: string | null;
  };
  experiences?: Array<{
    id?: string;
    company: string;
    role: string;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
    bullets?: string[] | null;
    bulletsHtml?: string | null;
    isVisible?: boolean | null;
  }>;
  educations?: Array<{
    id?: string;
    institution: string;
    degree?: string | null;
    fieldOfStudy?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
    description?: string | null;
    isVisible?: boolean | null;
  }>;
  /** Flat skills from resume upload (`string[]` or `{ name }[]`). */
  skills?: Array<string | { name?: string | null } | null> | null;
  skillGroups?: Array<{
    id?: string;
    name: string;
    /** Blank-build editor format */
    skillsText?: string;
    /** Upload / API format */
    skills?: string[] | null;
  }>;
  links?: Array<{
    id?: string;
    type: string;
    url: string;
    label?: string | null;
    isVisible?: boolean | null;
  }>;
  projects?: Array<{
    id?: string;
    title: string;
    description?: string | null;
    highlights?: string[] | null;
    technologies?: string[] | null;
    repoUrl?: string | null;
    liveUrl?: string | null;
    isVisible?: boolean;
    showOnResume?: boolean;
  }>;
  contactInfo?: {
    email?: string | null;
    phone?: string | null;
    website?: string | null;
  } | null;
}

const EPOCH = new Date(0);

function skillNamesFromGroup(group: { skillsText?: string; skills?: string[] | null }): string[] {
  if (typeof group.skillsText === 'string' && group.skillsText.trim()) {
    return parseCommaSeparatedSkills(group.skillsText);
  }
  if (Array.isArray(group.skills)) {
    return group.skills.map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function skillNamesFromFlat(skills: OnboardingResumePreviewDraft['skills']): string[] {
  if (!skills?.length) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const name = (typeof skill === 'string' ? skill : skill?.name)?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * Build a PublicProfile-shaped object from onboarding build-step or upload data
 * so the shared ResumeTemplateGallery can render live previews.
 */
export function buildOnboardingResumePreviewProfile(
  draft: OnboardingResumePreviewDraft
): PublicProfile {
  const profileId = 'onboarding-preview';

  let rawGroups = draft.skillGroups ?? [];
  if (rawGroups.length === 0) {
    const flat = skillNamesFromFlat(draft.skills);
    if (flat.length > 0) {
      rawGroups = [{ id: 'skills', name: 'Skills', skills: flat }];
    }
  }

  const skillGroups = rawGroups
    .map((group, groupIndex) => {
      const groupId = group.id || `skill-group-${groupIndex}`;
      const skills = skillNamesFromGroup(group).map((name, skillIndex) => ({
        id: `${groupId}-skill-${skillIndex}`,
        profileId,
        name,
        level: null,
        category: group.name || 'Skills',
        groupId,
        sortOrder: skillIndex,
        isVisible: true,
        source: 'MANUAL' as const,
        createdAt: EPOCH,
        updatedAt: EPOCH,
      }));
      return {
        id: groupId,
        profileId,
        name: group.name.trim() || 'Skills',
        sortOrder: groupIndex,
        skillsHtml: null,
        createdAt: EPOCH,
        updatedAt: EPOCH,
        skills,
      };
    })
    .filter((group) => group.skills.length > 0);

  const skills = skillGroups.flatMap((group) => group.skills);

  return {
    id: profileId,
    handle: 'preview',
    resumeTitle: 'Preview',
    isArchived: false,
    status: 'DRAFT',
    resumeVisibility: 'PRIVATE',
    portfolioVisibility: 'PUBLIC',
    linksVisibility: 'PUBLIC',
    firstName: draft.profile.firstName ?? null,
    firstNameSource: 'MANUAL',
    middleName: draft.profile.middleName ?? null,
    middleNameSource: 'MANUAL',
    lastName: draft.profile.lastName ?? null,
    lastNameSource: 'MANUAL',
    headline: draft.profile.headline ?? null,
    headlineSource: 'MANUAL',
    summary: draft.profile.summary ?? null,
    summarySource: 'MANUAL',
    summarySuggestion: null,
    avatarUrl: draft.profile.avatarUrl ?? null,
    avatarUrlSource: 'MANUAL',
    resumeShowPhoto: Boolean(draft.profile.avatarUrl),
    location: draft.profile.location ?? null,
    locationSource: 'MANUAL',
    unlistedKey: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    publishedAt: null,
    autoGeneratedDismissed: false,
    activeForUserId: null,
    primaryForUserId: null,
    resumeDesign: { ...RESUME_DESIGN_DEFAULTS } satisfies ResumeDesign,
    contactInfo: {
      email: draft.contactInfo?.email ?? null,
      phone: draft.contactInfo?.phone ?? null,
      website: draft.contactInfo?.website ?? null,
    },
    links: (draft.links ?? [])
      .filter((link) => link.url?.trim())
      .map((link, index) => ({
        id: link.id || `link-${index}`,
        profileId,
        type: link.type as PublicProfile['links'][number]['type'],
        url: link.url,
        label: link.label ?? null,
        sortOrder: index,
        isVisible: link.isVisible !== false,
        source: 'MANUAL' as const,
        createdAt: EPOCH,
        updatedAt: EPOCH,
      })),
    workExperiences: (draft.experiences ?? []).map((exp, index) => ({
      id: exp.id || `exp-${index}`,
      profileId,
      company: exp.company,
      companyUrl: null,
      companyLogoUrl: null,
      role: exp.role,
      location: exp.location ?? null,
      startDate: exp.startDate ? new Date(exp.startDate) : null,
      endDate: exp.endDate ? new Date(exp.endDate) : null,
      isCurrent: Boolean(exp.isCurrent),
      bullets: exp.bullets ?? [],
      bulletsHtml: exp.bulletsHtml ?? null,
      sortOrder: index,
      isVisible: exp.isVisible !== false,
      source: 'MANUAL' as const,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    })),
    educations: (draft.educations ?? []).map((edu, index) => ({
      id: edu.id || `edu-${index}`,
      profileId,
      institution: edu.institution,
      institutionUrl: null,
      degree: edu.degree ?? null,
      fieldOfStudy: edu.fieldOfStudy ?? null,
      location: edu.location ?? null,
      startDate: edu.startDate ? new Date(edu.startDate) : null,
      endDate: edu.endDate ? new Date(edu.endDate) : null,
      isCurrent: false,
      gpa: edu.gpa ?? null,
      activities: null,
      description: edu.description ?? null,
      descriptionHtml: null,
      sortOrder: index,
      isVisible: edu.isVisible !== false,
      source: 'MANUAL' as const,
      createdAt: EPOCH,
      updatedAt: EPOCH,
    })),
    skills,
    skillGroups,
    projects: (draft.projects ?? []).map((project, index) => ({
      id: project.id || `proj-${index}`,
      profileId,
      title: project.title,
      description: project.description ?? null,
      shortDesc: null,
      url: project.liveUrl ?? null,
      repoUrl: project.repoUrl ?? null,
      imageUrl: null,
      techStack: project.technologies ?? [],
      highlights: project.highlights ?? [],
      startDate: null,
      endDate: null,
      isCurrent: false,
      featured: false,
      sortOrder: index,
      isVisible: project.isVisible !== false,
      showOnPortfolio: true,
      showOnResume: project.showOnResume !== false,
      showStats: false,
      showReadme: false,
      source: 'MANUAL' as const,
      createdAt: EPOCH,
      updatedAt: EPOCH,
      ghStars: null,
      ghForks: null,
      ghLanguage: null,
    })),
    awards: [],
    certifications: [],
    blogPosts: [],
    youtubeVideos: [],
    photos: [],
    sections: buildResumePreviewSections(profileId),
  } as unknown as PublicProfile;
}
