import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { MAX_RESUMES_PER_USER } from '@/lib/validations';

/**
 * Convert a Prisma JsonValue (which can be `null`) to a valid nullable JSON input.
 * Prisma reads return `JsonValue` (includes `null`), but writes expect
 * `InputJsonValue | NullableJsonNullValueInput | undefined`.
 */
function nullableJson(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

const resumeLogger = logger.child({ source: 'api-resumes' });

const DEFAULT_SECTION_CONFIGS = [
  { type: 'BASIC_INFO', title: 'Header' },
  { type: 'PHOTOS', title: 'Photos' },
  { type: 'SUMMARY', title: 'Summary' },
  { type: 'EXPERIENCE', title: 'Experience' },
  { type: 'EDUCATION', title: 'Education' },
  { type: 'SKILLS', title: 'Skills' },
  { type: 'PROJECTS', title: 'Projects' },
  { type: 'LINKS', title: 'Links' },
  { type: 'AWARDS', title: 'Awards' },
  { type: 'CERTIFICATIONS', title: 'Certifications' },
] as const;

const createResumeSchema = z.object({
  strategy: z.enum(['BLANK', 'CLONE', 'UPLOAD']).default('BLANK'),
  title: z.string().trim().min(1).max(120).optional(),
  sourceProfileId: z.string().trim().optional(),
});

const cloneProfileInclude = {
  contactInfo: true,
  links: { orderBy: { sortOrder: 'asc' } },
  workExperiences: { orderBy: { sortOrder: 'asc' } },
  educations: { orderBy: { sortOrder: 'asc' } },
  skills: { orderBy: { sortOrder: 'asc' } },
  skillGroups: { orderBy: { sortOrder: 'asc' } },
  projects: { orderBy: { sortOrder: 'asc' } },
  awards: { orderBy: { sortOrder: 'asc' } },
  certifications: { orderBy: { sortOrder: 'asc' } },
  blogPosts: { orderBy: { createdAt: 'desc' } },
  youtubeVideos: { orderBy: { createdAt: 'desc' } },
  photos: { orderBy: { sortOrder: 'asc' } },
  sections: { orderBy: { sortOrder: 'asc' } },
  githubProfile: true,
} satisfies Prisma.ProfileInclude;

type CloneSourceProfile = Prisma.ProfileGetPayload<{ include: typeof cloneProfileInclude }>;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

async function ensureActiveProfile(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profile: { select: { id: true } },
    },
  });

  if (!user) return null;

  if (user.profile?.id) {
    return user.profile.id;
  }

  const fallback = await db.profile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!fallback) return null;

  await db.user.update({
    where: { id: user.id },
    data: {
      profile: {
        connect: { id: fallback.id },
      },
    },
  });

  return fallback.id;
}

async function setActiveProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  profileId: string
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      profile: {
        connect: { id: profileId },
      },
    },
  });
}

async function generateUniqueHandle(
  tx: Prisma.TransactionClient,
  base: string,
  fallbackPrefix: string
): Promise<string> {
  const normalizedBase = slugify(base) || slugify(fallbackPrefix) || 'resume';
  const firstTry = `${normalizedBase}-${Math.random().toString(36).slice(2, 7)}`;

  const firstExists = await tx.profile.findUnique({
    where: { handle: firstTry },
    select: { id: true },
  });

  if (!firstExists) return firstTry;

  for (let index = 0; index < 15; index += 1) {
    const candidate = `${normalizedBase}-${Math.random().toString(36).slice(2, 9)}`;
    const exists = await tx.profile.findUnique({
      where: { handle: candidate },
      select: { id: true },
    });

    if (!exists) return candidate;
  }

  return `${fallbackPrefix}-${Date.now()}`;
}

/**
 * Generate a unique resume title for a user.
 * If a title is provided, checks for duplicates and appends a numeric suffix if needed.
 * If no title is provided, generates one in the format "My Resume <YYYYMMDD_HHmm>".
 */
async function generateUniqueResumeTitle(
  tx: Prisma.TransactionClient,
  userId: string,
  requestedTitle: string | undefined
): Promise<string> {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

  const baseTitle = requestedTitle?.trim() || `My Resume ${timestamp}`;

  // Check if the exact title already exists for this user
  const existing = await tx.profile.findFirst({
    where: { userId, resumeTitle: baseTitle, isArchived: false },
    select: { id: true },
  });

  if (!existing) return baseTitle;

  // Append incrementing suffix until unique
  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${baseTitle} (${suffix})`;
    const dup = await tx.profile.findFirst({
      where: { userId, resumeTitle: candidate, isArchived: false },
      select: { id: true },
    });
    if (!dup) return candidate;
  }

  // Fallback: append timestamp to guarantee uniqueness
  return `${baseTitle} ${timestamp}`;
}

async function createDefaultSections(
  tx: Prisma.TransactionClient,
  profileId: string
): Promise<void> {
  await tx.profileSection.createMany({
    data: DEFAULT_SECTION_CONFIGS.map((config, index) => ({
      profileId,
      type: config.type,
      title: config.title,
      sortOrder: index,
      isVisible: true,
    })),
  });
}

async function createBlankProfile(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
  title: string | undefined
): Promise<{ id: string; handle: string; resumeTitle: string }> {
  const emailPrefix = user.email.split('@')[0] ?? 'resume';
  const resumeTitle = await generateUniqueResumeTitle(tx, user.id, title);
  const generatedHandle = await generateUniqueHandle(tx, resumeTitle, emailPrefix);

  const profile = await tx.profile.create({
    data: {
      userId: user.id,
      handle: generatedHandle,
      resumeTitle,
      status: 'DRAFT',
    },
    select: {
      id: true,
      handle: true,
      resumeTitle: true,
    },
  });

  await tx.contactInfo.create({
    data: { profileId: profile.id },
  });

  await createDefaultSections(tx, profile.id);

  return profile;
}

async function cloneProfile(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
  source: CloneSourceProfile,
  title: string | undefined
): Promise<{ id: string; handle: string; resumeTitle: string }> {
  const rawCloneTitle = title?.trim() || `${source.resumeTitle} Copy`;
  const cloneTitle = await generateUniqueResumeTitle(tx, user.id, rawCloneTitle);
  const generatedHandle = await generateUniqueHandle(
    tx,
    cloneTitle,
    user.email.split('@')[0] ?? 'resume'
  );

  const profile = await tx.profile.create({
    data: {
      userId: user.id,
      handle: generatedHandle,
      resumeTitle: cloneTitle,
      status: source.status,
      resumeVisibility: source.resumeVisibility,
      portfolioVisibility: source.portfolioVisibility,
      linksVisibility: source.linksVisibility,
      firstName: source.firstName,
      firstNameSource: source.firstNameSource,
      lastName: source.lastName,
      lastNameSource: source.lastNameSource,
      headline: source.headline,
      headlineSource: source.headlineSource,
      summary: source.summary,
      summarySource: source.summarySource,
      summarySuggestion: source.summarySuggestion,
      avatarUrl: source.avatarUrl,
      avatarUrlSource: source.avatarUrlSource,
      resumeShowPhoto: source.resumeShowPhoto,
      location: source.location,
      locationSource: source.locationSource,
      autoGeneratedDismissed: source.autoGeneratedDismissed,
    },
    select: {
      id: true,
      handle: true,
      resumeTitle: true,
    },
  });

  if (source.contactInfo) {
    await tx.contactInfo.create({
      data: {
        profileId: profile.id,
        email: source.contactInfo.email,
        emailSource: source.contactInfo.emailSource,
        emailPublic: source.contactInfo.emailPublic,
        additionalEmails: nullableJson(source.contactInfo.additionalEmails),
        phone: source.contactInfo.phone,
        phoneCountryCode: source.contactInfo.phoneCountryCode,
        phoneNumber: source.contactInfo.phoneNumber,
        phoneSource: source.contactInfo.phoneSource,
        phonePublic: source.contactInfo.phonePublic,
        additionalPhones: nullableJson(source.contactInfo.additionalPhones),
        locationPublic: source.contactInfo.locationPublic,
        website: source.contactInfo.website,
        websiteSource: source.contactInfo.websiteSource,
        headerFieldsOrder: nullableJson(source.contactInfo.headerFieldsOrder),
      },
    });
  } else {
    await tx.contactInfo.create({ data: { profileId: profile.id } });
  }

  if (source.sections.length > 0) {
    await tx.profileSection.createMany({
      data: source.sections.map((section) => ({
        profileId: profile.id,
        type: section.type,
        customName: section.customName,
        title: section.title,
        sortOrder: section.sortOrder,
        isVisible: section.isVisible,
        customContent: nullableJson(section.customContent),
        contentType: section.contentType,
      })),
    });
  } else {
    await createDefaultSections(tx, profile.id);
  }

  if (source.links.length > 0) {
    await tx.link.createMany({
      data: source.links.map((link) => ({
        profileId: profile.id,
        type: link.type,
        url: link.url,
        label: link.label,
        isVisible: link.isVisible,
        source: link.source,
        sortOrder: link.sortOrder,
      })),
    });
  }

  if (source.workExperiences.length > 0) {
    await tx.workExperience.createMany({
      data: source.workExperiences.map((item) => ({
        profileId: profile.id,
        company: item.company,
        companyUrl: item.companyUrl,
        companyLogo: item.companyLogo,
        role: item.role,
        location: item.location,
        locationType: item.locationType,
        employmentType: item.employmentType,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent,
        bullets: item.bullets,
        bulletsHtml: item.bulletsHtml,
        metrics: nullableJson(item.metrics),
        tags: item.tags,
        isVisible: item.isVisible,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  if (source.educations.length > 0) {
    await tx.education.createMany({
      data: source.educations.map((item) => ({
        profileId: profile.id,
        institution: item.institution,
        institutionUrl: item.institutionUrl,
        institutionLogo: item.institutionLogo,
        degree: item.degree,
        fieldOfStudy: item.fieldOfStudy,
        location: item.location,
        startDate: item.startDate,
        endDate: item.endDate,
        isCurrent: item.isCurrent,
        gpa: item.gpa,
        description: item.description,
        activities: item.activities,
        honors: item.honors,
        isVisible: item.isVisible,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  const skillGroupIdMap = new Map<string, string>();
  for (const group of source.skillGroups) {
    const createdGroup = await tx.skillGroup.create({
      data: {
        profileId: profile.id,
        name: group.name,
        sortOrder: group.sortOrder,
      },
      select: { id: true },
    });
    skillGroupIdMap.set(group.id, createdGroup.id);
  }

  if (source.skills.length > 0) {
    await tx.skill.createMany({
      data: source.skills.map((skill) => ({
        profileId: profile.id,
        name: skill.name,
        level: skill.level,
        yearsOfExp: skill.yearsOfExp,
        groupId: skill.groupId ? (skillGroupIdMap.get(skill.groupId) ?? null) : null,
        isVisible: skill.isVisible,
        source: skill.source,
        sortOrder: skill.sortOrder,
      })),
    });
  }

  if (source.projects.length > 0) {
    await tx.project.createMany({
      data: source.projects.map((project) => ({
        profileId: profile.id,
        title: project.title,
        description: project.description,
        shortDesc: project.shortDesc,
        url: project.url,
        repoUrl: project.repoUrl,
        imageUrl: project.imageUrl,
        images: project.images,
        techStack: project.techStack,
        highlights: project.highlights,
        githubStars: project.githubStars,
        githubForks: project.githubForks,
        githubLanguage: project.githubLanguage,
        githubTopics: project.githubTopics,
        githubOwner: project.githubOwner,
        githubRepo: project.githubRepo,
        githubReadme: project.githubReadme,
        githubPinned: project.githubPinned,
        githubLastPush: project.githubLastPush,
        githubLicense: project.githubLicense,
        githubWatchers: project.githubWatchers,
        isVisible: project.isVisible,
        showOnPortfolio: project.showOnPortfolio,
        showOnResume: project.showOnResume,
        showStats: project.showStats,
        showReadme: project.showReadme,
        customDescription: project.customDescription,
        startDate: project.startDate,
        endDate: project.endDate,
        isCurrent: project.isCurrent,
        featured: project.featured,
        source: project.source,
        sortOrder: project.sortOrder,
      })),
    });
  }

  if (source.awards.length > 0) {
    await tx.award.createMany({
      data: source.awards.map((item) => ({
        profileId: profile.id,
        title: item.title,
        issuer: item.issuer,
        date: item.date,
        description: item.description,
        url: item.url,
        isVisible: item.isVisible,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  if (source.certifications.length > 0) {
    await tx.certification.createMany({
      data: source.certifications.map((item) => ({
        profileId: profile.id,
        name: item.name,
        issuer: item.issuer,
        issuerLogo: item.issuerLogo,
        credentialId: item.credentialId,
        credentialUrl: item.credentialUrl,
        issueDate: item.issueDate,
        expirationDate: item.expirationDate,
        isVisible: item.isVisible,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  if (source.blogPosts.length > 0) {
    await tx.blogPost.createMany({
      data: source.blogPosts.map((item) => ({
        profileId: profile.id,
        title: item.title,
        url: item.url,
        slug: item.slug,
        excerpt: item.excerpt,
        content: item.content,
        thumbnail: item.thumbnail,
        author: item.author,
        publishedAt: item.publishedAt,
        tags: item.tags,
        readTimeMin: item.readTimeMin,
        claps: item.claps,
        platform: item.platform,
        platformIcon: item.platformIcon,
        isVisible: item.isVisible,
        isFeatured: item.isFeatured,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  if (source.youtubeVideos.length > 0) {
    await tx.youTubeVideo.createMany({
      data: source.youtubeVideos.map((item) => ({
        profileId: profile.id,
        videoId: item.videoId,
        title: item.title,
        description: item.description,
        url: item.url,
        thumbnail: item.thumbnail,
        channelId: item.channelId,
        channelTitle: item.channelTitle,
        publishedAt: item.publishedAt,
        duration: item.duration,
        viewCount: item.viewCount,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        tags: item.tags,
        isVisible: item.isVisible,
        isFeatured: item.isFeatured,
        showOnPortfolio: item.showOnPortfolio,
        source: item.source,
        sortOrder: item.sortOrder,
      })),
    });
  }

  if (source.photos.length > 0) {
    await tx.profilePhoto.createMany({
      data: source.photos.map((item) => ({
        profileId: profile.id,
        url: item.url,
        caption: item.caption,
        category: item.category,
        source: item.source,
        sortOrder: item.sortOrder,
        isVisible: item.isVisible,
      })),
    });
  }

  if (source.githubProfile) {
    await tx.gitHubProfile.create({
      data: {
        profileId: profile.id,
        username: source.githubProfile.username,
        githubId: source.githubProfile.githubId,
        avatarUrl: source.githubProfile.avatarUrl,
        htmlUrl: source.githubProfile.htmlUrl,
        bio: source.githubProfile.bio,
        company: source.githubProfile.company,
        blog: source.githubProfile.blog,
        location: source.githubProfile.location,
        hireable: source.githubProfile.hireable,
        publicRepos: source.githubProfile.publicRepos,
        publicGists: source.githubProfile.publicGists,
        followers: source.githubProfile.followers,
        following: source.githubProfile.following,
        accountCreatedAt: source.githubProfile.accountCreatedAt,
        totalStars: source.githubProfile.totalStars,
        totalForks: source.githubProfile.totalForks,
        primaryLanguages: source.githubProfile.primaryLanguages,
        languageStats: nullableJson(source.githubProfile.languageStats),
        contributionStats: nullableJson(source.githubProfile.contributionStats),
        organizations: nullableJson(source.githubProfile.organizations),
        showOnPortfolio: source.githubProfile.showOnPortfolio,
        showStats: source.githubProfile.showStats,
        showOrganizations: source.githubProfile.showOrganizations,
        showLanguageChart: source.githubProfile.showLanguageChart,
        showContributions: source.githubProfile.showContributions,
        hiddenLanguages: source.githubProfile.hiddenLanguages,
        hiddenOrganizations: source.githubProfile.hiddenOrganizations,
        lastSyncAt: source.githubProfile.lastSyncAt,
        syncStatus: source.githubProfile.syncStatus,
        syncError: source.githubProfile.syncError,
      },
    });
  }

  return profile;
}

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const activeProfileId = await ensureActiveProfile(user.id);

    const resumes = await db.profile.findMany({
      where: {
        userId: user.id,
        isArchived: false,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        handle: true,
        resumeTitle: true,
        status: true,
        resumeVisibility: true,
        firstName: true,
        lastName: true,
        headline: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      resumes,
      activeProfileId,
    });
  } catch (error) {
    return handleApiError(error, { method: 'GET', path: '/api/resumes' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json();
    const parsed = createResumeSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Enforce per-user resume limit
    const existingCount = await db.profile.count({
      where: { userId: user.id, isArchived: false },
    });

    if (existingCount >= MAX_RESUMES_PER_USER) {
      return NextResponse.json(
        {
          error: `You can create up to ${MAX_RESUMES_PER_USER} resumes. Please delete an existing resume to create a new one.`,
        },
        { status: 403 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      let createdProfile: { id: string; handle: string; resumeTitle: string };

      if (body.strategy === 'CLONE') {
        const sourceProfileId = body.sourceProfileId;
        if (!sourceProfileId) {
          throw new Error('sourceProfileId is required for CLONE strategy');
        }

        const source = await tx.profile.findFirst({
          where: {
            id: sourceProfileId,
            userId: user.id,
          },
          include: cloneProfileInclude,
        });

        if (!source) {
          return null;
        }

        createdProfile = await cloneProfile(tx, user, source, body.title);
      } else {
        createdProfile = await createBlankProfile(tx, user, body.title);
      }

      await setActiveProfile(tx, user.id, createdProfile.id);

      return createdProfile;
    });

    if (!result) {
      return NextResponse.json({ error: 'Source resume not found' }, { status: 404 });
    }

    resumeLogger.info('Created resume', {
      strategy: body.strategy,
      profileId: result.id,
      userId: user.id,
    });

    return NextResponse.json(
      {
        success: true,
        resume: result,
        nextAction: body.strategy === 'UPLOAD' ? 'UPLOAD_RESUME' : 'OPEN_BUILDER',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/resumes' });
  }
}
