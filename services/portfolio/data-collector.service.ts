/**
 * Profile Data Collector Service
 *
 * Gathers all data for a profile from the database and normalizes it
 * into the canonical CollectedProfileData format. This is the single
 * input to the AI portfolio generation pipeline.
 *
 * Responsibilities:
 * - Fetch complete profile with all relations
 * - Normalize dates, nulls, and types
 * - Calculate data completeness score
 * - Identify active data sources
 * - Strip sensitive/internal fields
 * - Handle missing data gracefully (never throws on sparse profiles)
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

import type {
  CollectedAward,
  CollectedBlogPost,
  CollectedCertification,
  CollectedEducation,
  CollectedGitHubProfile,
  CollectedLink,
  CollectedPhoto,
  CollectedProfileData,
  CollectedProject,
  CollectedSkill,
  CollectedSkillGroup,
  CollectedWorkExperience,
  CollectedYouTubeVideo,
  ConnectedSource,
  DataRichness,
} from '@/types/portfolio';

const collectorLogger = logger.child({ source: 'portfolio-data-collector' });

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Collect all profile data for portfolio generation.
 * Returns a fully normalized, pipeline-ready data bundle.
 *
 * @param profileId - The profile to collect data for
 * @throws If the profile doesn't exist
 */
export async function collectProfileData(profileId: string): Promise<CollectedProfileData> {
  collectorLogger.info('Collecting profile data for portfolio generation', { profileId });

  const profile = await db.profile.findUnique({
    where: { id: profileId },
    include: {
      contactInfo: true,
      links: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      workExperiences: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      educations: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      skills: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      skillGroups: {
        include: { skills: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      projects: {
        where: { isVisible: true, showOnPortfolio: true },
        orderBy: { sortOrder: 'asc' },
      },
      awards: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      certifications: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      blogPosts: { where: { isVisible: true }, orderBy: { publishedAt: 'desc' } },
      youtubeVideos: { where: { isVisible: true }, orderBy: { publishedAt: 'desc' } },
      photos: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      githubProfile: true,
      dataSourceConnections: true,
      sections: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  // Normalize all data
  const basics = {
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    headline: profile.headline || null,
    summary: profile.summary || null,
    location: profile.location || null,
    avatarUrl: profile.avatarUrl || null,
  };

  const contact = {
    email: profile.contactInfo?.emailPublic ? profile.contactInfo.email : null,
    phone: profile.contactInfo?.phonePublic ? profile.contactInfo.phone : null,
    website: profile.contactInfo?.website || null,
  };

  const links: CollectedLink[] = profile.links.map((l) => ({
    type: l.type,
    url: l.url,
    label: l.label || null,
    source: l.source,
  }));

  const workExperiences: CollectedWorkExperience[] = profile.workExperiences.map((w) => ({
    company: w.company,
    companyUrl: w.companyUrl || null,
    companyLogo: w.companyLogo || null,
    role: w.role,
    location: w.location || null,
    locationType: w.locationType || null,
    employmentType: w.employmentType || null,
    startDate: safeISODate(w.startDate),
    endDate: w.endDate ? safeISODate(w.endDate) : null,
    isCurrent: w.isCurrent,
    bullets: w.bullets || [],
    tags: w.tags || [],
    source: w.source,
  }));

  const education: CollectedEducation[] = profile.educations.map((e) => ({
    institution: e.institution,
    institutionUrl: e.institutionUrl || null,
    institutionLogo: e.institutionLogo || null,
    degree: e.degree || null,
    fieldOfStudy: e.fieldOfStudy || null,
    location: e.location || null,
    startDate: e.startDate ? safeISODate(e.startDate) : null,
    endDate: e.endDate ? safeISODate(e.endDate) : null,
    isCurrent: e.isCurrent,
    gpa: e.gpa || null,
    description: e.description || null,
    activities: e.activities || [],
    honors: e.honors || [],
    source: e.source,
  }));

  const skills: CollectedSkill[] = profile.skills.map((s) => ({
    name: s.name,
    level: s.level || null,
    yearsOfExp: s.yearsOfExp || null,
    groupName: s.groupId
      ? (profile.skillGroups.find((g) => g.id === s.groupId)?.name ?? null)
      : null,
    source: s.source,
  }));

  const skillGroups: CollectedSkillGroup[] = profile.skillGroups.map((g) => ({
    name: g.name,
    skills: g.skills.map((s) => s.name),
  }));

  const projects: CollectedProject[] = profile.projects.map((p) => ({
    title: p.title,
    description: p.description || null,
    shortDesc: p.shortDesc || null,
    url: p.url || null,
    repoUrl: p.repoUrl || null,
    imageUrl: p.imageUrl || null,
    images: p.images || [],
    techStack: p.techStack || [],
    highlights: p.highlights || [],
    startDate: p.startDate ? safeISODate(p.startDate) : null,
    endDate: p.endDate ? safeISODate(p.endDate) : null,
    isCurrent: p.isCurrent,
    featured: p.featured,
    source: p.source,
    github:
      p.source === 'GITHUB' || p.githubStars != null
        ? {
            stars: p.githubStars ?? 0,
            forks: p.githubForks ?? 0,
            language: p.githubLanguage || null,
            topics: p.githubTopics || [],
            owner: p.githubOwner || null,
            repo: p.githubRepo || null,
            readme: p.githubReadme || null,
            isPinned: p.githubPinned,
            lastPush: p.githubLastPush ? safeISODate(p.githubLastPush) : null,
            license: p.githubLicense || null,
            watchers: p.githubWatchers ?? 0,
          }
        : undefined,
  }));

  const blogPosts: CollectedBlogPost[] = profile.blogPosts.map((b) => ({
    title: b.title,
    url: b.url,
    excerpt: b.excerpt || null,
    content: b.content || null,
    thumbnail: b.thumbnail || null,
    author: b.author || null,
    publishedAt: b.publishedAt ? safeISODate(b.publishedAt) : null,
    tags: b.tags || [],
    readTimeMin: b.readTimeMin || null,
    claps: b.claps || null,
    platform: b.platform || null,
    platformIcon: b.platformIcon || null,
    isFeatured: b.isFeatured,
    source: b.source,
  }));

  const youtubeVideos: CollectedYouTubeVideo[] = profile.youtubeVideos.map((v) => ({
    videoId: v.videoId,
    title: v.title,
    description: v.description || null,
    url: v.url,
    thumbnail: v.thumbnail || null,
    publishedAt: v.publishedAt ? safeISODate(v.publishedAt) : null,
    duration: v.duration || null,
    viewCount: v.viewCount || null,
    likeCount: v.likeCount || null,
    tags: v.tags || [],
    isFeatured: v.isFeatured,
  }));

  const awards: CollectedAward[] = profile.awards.map((a) => ({
    title: a.title,
    issuer: a.issuer || null,
    date: a.date ? safeISODate(a.date) : null,
    description: a.description || null,
    url: a.url || null,
  }));

  const certifications: CollectedCertification[] = profile.certifications.map((c) => ({
    name: c.name,
    issuer: c.issuer,
    issuerLogo: c.issuerLogo || null,
    credentialId: c.credentialId || null,
    credentialUrl: c.credentialUrl || null,
    issueDate: c.issueDate ? safeISODate(c.issueDate) : null,
    expirationDate: c.expirationDate ? safeISODate(c.expirationDate) : null,
  }));

  const github: CollectedGitHubProfile | null = profile.githubProfile
    ? {
        username: profile.githubProfile.username,
        avatarUrl: profile.githubProfile.avatarUrl || null,
        htmlUrl: profile.githubProfile.htmlUrl || null,
        bio: profile.githubProfile.bio || null,
        company: profile.githubProfile.company || null,
        blog: profile.githubProfile.blog || null,
        location: profile.githubProfile.location || null,
        publicRepos: profile.githubProfile.publicRepos,
        followers: profile.githubProfile.followers,
        following: profile.githubProfile.following,
        totalStars: profile.githubProfile.totalStars,
        totalForks: profile.githubProfile.totalForks,
        primaryLanguages: profile.githubProfile.primaryLanguages || [],
        languageStats: (profile.githubProfile.languageStats as Record<string, number>) || null,
        contributionStats:
          (profile.githubProfile.contributionStats as Record<string, unknown>) || null,
        organizations:
          (profile.githubProfile.organizations as Array<{
            login: string;
            avatarUrl: string;
            url: string;
          }>) || [],
      }
    : null;

  const photos: CollectedPhoto[] = profile.photos.map((p) => ({
    url: p.url,
    caption: p.caption || null,
    category: p.category,
  }));

  const connectedSources: ConnectedSource[] = profile.dataSourceConnections.map((d) => ({
    source: d.source,
    status: d.status,
    lastImportedAt: d.lastImportedAt ? safeISODate(d.lastImportedAt) : null,
    itemsImported: d.itemsImported,
  }));

  // Identify which sources actually contributed data
  const activeSources = identifyActiveSources(profile);
  const completeness = calculateCompleteness(basics, contact, {
    workExperiences,
    education,
    skills,
    projects,
    blogPosts,
    github,
    awards,
    certifications,
  });

  const collected: CollectedProfileData = {
    basics,
    contact,
    links,
    workExperiences,
    education,
    skills,
    skillGroups,
    projects,
    blogPosts,
    youtubeVideos,
    awards,
    certifications,
    github,
    photos,
    connectedSources,
    meta: {
      collectedAt: new Date().toISOString(),
      profileId: profile.id,
      handle: profile.handle,
      activeSources,
      completeness,
    },
  };

  collectorLogger.info('Profile data collected', {
    profileId,
    handle: profile.handle,
    completeness,
    activeSources,
    counts: {
      workExperiences: workExperiences.length,
      education: education.length,
      skills: skills.length,
      projects: projects.length,
      blogPosts: blogPosts.length,
      videos: youtubeVideos.length,
      awards: awards.length,
      certifications: certifications.length,
    },
  });

  return collected;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Safely convert a Date to ISO string, handling edge cases. */
function safeISODate(date: Date | string | null | undefined): string {
  if (!date) return '';
  if (typeof date === 'string') return date;
  try {
    return date.toISOString();
  } catch {
    return '';
  }
}

/** Identify which data sources actually contributed data to this profile. */
function identifyActiveSources(profile: {
  firstNameSource: string;
  lastNameSource: string;
  headlineSource: string;
  summarySource: string;
  workExperiences: Array<{ source: string }>;
  educations: Array<{ source: string }>;
  skills: Array<{ source: string }>;
  projects: Array<{ source: string }>;
  blogPosts: Array<{ source: string }>;
  githubProfile: { username: string } | null;
  dataSourceConnections: Array<{ source: string; status: string }>;
}): string[] {
  const sources = new Set<string>();

  // Profile field sources
  [
    profile.firstNameSource,
    profile.lastNameSource,
    profile.headlineSource,
    profile.summarySource,
  ].forEach((s) => {
    if (s && s !== 'MANUAL') sources.add(s);
  });

  // Always include MANUAL if user has any data
  sources.add('MANUAL');

  // Item sources
  [
    ...profile.workExperiences,
    ...profile.educations,
    ...profile.skills,
    ...profile.projects,
  ].forEach((item) => {
    if (item.source) sources.add(item.source);
  });

  profile.blogPosts.forEach((b) => {
    if (b.source) sources.add(b.source);
  });

  if (profile.githubProfile) sources.add('GITHUB');

  // Connected sources
  profile.dataSourceConnections
    .filter((d) => d.status === 'CONNECTED')
    .forEach((d) => sources.add(d.source));

  return Array.from(sources);
}

/** Calculate a 0-1 data completeness score. */
function calculateCompleteness(
  basics: {
    firstName: string | null;
    lastName: string | null;
    headline: string | null;
    summary: string | null;
    avatarUrl: string | null;
  },
  contact: { email: string | null; website: string | null },
  sections: {
    workExperiences: unknown[];
    education: unknown[];
    skills: unknown[];
    projects: unknown[];
    blogPosts: unknown[];
    github: unknown | null;
    awards: unknown[];
    certifications: unknown[];
  }
): number {
  let score = 0;
  let total = 0;

  // Basics (weighted heavily)
  const basicFields = [
    basics.firstName,
    basics.lastName,
    basics.headline,
    basics.summary,
    basics.avatarUrl,
  ];
  total += 5;
  score += basicFields.filter(Boolean).length;

  // Contact
  total += 2;
  if (contact.email) score += 1;
  if (contact.website) score += 1;

  // Sections (each section's existence counts)
  const sectionChecks: [unknown[], number][] = [
    [sections.workExperiences, 2], // High weight
    [sections.education, 1.5],
    [sections.skills, 1.5],
    [sections.projects, 2], // High weight
    [sections.blogPosts, 1],
    [sections.awards, 0.5],
    [sections.certifications, 0.5],
  ];

  for (const [items, weight] of sectionChecks) {
    total += weight;
    if (Array.isArray(items) && items.length > 0) {
      score += weight;
    }
  }

  // GitHub bonus
  total += 1.5;
  if (sections.github) score += 1.5;

  return Math.min(1, score / total);
}

/**
 * Compute per-section richness scores for the AI pipeline.
 * This helps the AI understand what data is strong vs. weak.
 */
export function computeDataRichness(data: CollectedProfileData): DataRichness {
  const sections = {
    basics: scoreBooleans([
      !!data.basics.firstName,
      !!data.basics.lastName,
      !!data.basics.headline,
      !!data.basics.summary,
      !!data.basics.avatarUrl,
      !!data.basics.location,
    ]),
    experience: scoreArray(data.workExperiences, 3, (w) =>
      scoreBooleans([!!w.company, !!w.role, w.bullets.length > 0, w.bullets.length > 2])
    ),
    education: scoreArray(data.education, 2, (e) =>
      scoreBooleans([!!e.institution, !!e.degree, !!e.fieldOfStudy])
    ),
    skills: Math.min(1, data.skills.length / 10),
    projects: scoreArray(data.projects, 3, (p) =>
      scoreBooleans([
        !!p.title,
        !!p.description || !!p.shortDesc,
        p.techStack.length > 0,
        !!p.url || !!p.repoUrl,
        p.highlights.length > 0,
      ])
    ),
    writing: scoreArray(data.blogPosts, 3, (b) =>
      scoreBooleans([!!b.title, !!b.excerpt, !!b.publishedAt])
    ),
    github: data.github
      ? scoreBooleans([
          data.github.publicRepos > 0,
          data.github.totalStars > 0,
          data.github.followers > 5,
          data.github.primaryLanguages.length > 0,
          !!data.github.bio,
        ])
      : 0,
    awards: Math.min(1, data.awards.length > 0 ? 0.5 + data.awards.length * 0.25 : 0),
    certifications: Math.min(
      1,
      data.certifications.length > 0 ? 0.5 + data.certifications.length * 0.25 : 0
    ),
  };

  const values = Object.values(sections);
  const overall = values.reduce((a, b) => a + b, 0) / values.length;

  return { overall, sections };
}

/** Score a boolean checklist as 0-1. */
function scoreBooleans(checks: boolean[]): number {
  if (checks.length === 0) return 0;
  return checks.filter(Boolean).length / checks.length;
}

/** Score an array of items with per-item quality and expected count. */
function scoreArray<T>(items: T[], expectedCount: number, qualityFn: (item: T) => number): number {
  if (items.length === 0) return 0;
  const countScore = Math.min(1, items.length / expectedCount);
  const qualityScore = items.reduce((sum, item) => sum + qualityFn(item), 0) / items.length;
  return countScore * 0.4 + qualityScore * 0.6;
}
