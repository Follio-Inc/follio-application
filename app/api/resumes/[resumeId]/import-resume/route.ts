/**
 * Resume Import API for Builder
 *
 * POST /api/resumes/[resumeId]/import-resume
 *
 * Accepts a PDF file, parses it using AI (same service as onboarding),
 * clears all existing resume data, and saves the parsed data.
 */

import { auth } from '@clerk/nextjs/server';
import { DataSource, LinkType, Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { parseDateFlexible } from '@/lib/utils';
import {
  importResumeWithAI,
  isAIParserAvailable,
  type NormalizedResumeData,
} from '@/services/import/resume-ai.service';

const importLogger = logger.child({ source: 'api-resume-import' });

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────

function parseDateSafe(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;
  const result = parseDateFlexible(dateStr);
  return result ?? undefined;
}

function mapLinkType(type: string): LinkType {
  const upper = type?.toUpperCase() || 'OTHER';
  const valid: LinkType[] = [
    'GITHUB',
    'LINKEDIN',
    'TWITTER',
    'PORTFOLIO',
    'BLOG',
    'DRIBBBLE',
    'BEHANCE',
    'YOUTUBE',
    'OTHER',
  ];
  return valid.includes(upper as LinkType) ? (upper as LinkType) : LinkType.OTHER;
}

// ─── Clear existing data ──────────────────────────────────────────

async function clearProfileData(profileId: string): Promise<void> {
  importLogger.info('Clearing existing profile data', { profileId });

  // Skills reference SkillGroups via groupId FK, so delete skills first
  await db.$transaction([
    db.skill.deleteMany({ where: { profileId } }),
    db.skillGroup.deleteMany({ where: { profileId } }),
    db.workExperience.deleteMany({ where: { profileId } }),
    db.education.deleteMany({ where: { profileId } }),
    db.project.deleteMany({ where: { profileId } }),
    db.certification.deleteMany({ where: { profileId } }),
    db.link.deleteMany({ where: { profileId } }),
    db.contactInfo.deleteMany({ where: { profileId } }),
  ]);

  // Reset profile-level fields that come from a resume
  await db.profile.update({
    where: { id: profileId },
    data: {
      firstName: null,
      firstNameSource: DataSource.MANUAL,
      middleName: null,
      middleNameSource: DataSource.MANUAL,
      lastName: null,
      lastNameSource: DataSource.MANUAL,
      headline: null,
      headlineSource: DataSource.MANUAL,
      summary: null,
      summarySource: DataSource.MANUAL,
      location: null,
      locationSource: DataSource.MANUAL,
    },
  });
}

// ─── Save parsed data to profile ──────────────────────────────────

async function saveResumeDataToProfile(
  profileId: string,
  data: NormalizedResumeData
): Promise<void> {
  // 1. Update profile fields
  const profileUpdate: Prisma.ProfileUpdateInput = {};

  if (data.profile.firstName) {
    profileUpdate.firstName = data.profile.firstName;
    profileUpdate.firstNameSource = DataSource.RESUME;
  }
  if (data.profile.middleName) {
    profileUpdate.middleName = data.profile.middleName;
    profileUpdate.middleNameSource = DataSource.RESUME;
  }
  if (data.profile.lastName) {
    profileUpdate.lastName = data.profile.lastName;
    profileUpdate.lastNameSource = DataSource.RESUME;
  }
  if (data.profile.headline) {
    profileUpdate.headline = data.profile.headline;
    profileUpdate.headlineSource = DataSource.RESUME;
  }
  if (data.profile.summary) {
    profileUpdate.summary = data.profile.summary;
    profileUpdate.summarySource = DataSource.RESUME;
  }
  if (data.profile.location) {
    profileUpdate.location = data.profile.location;
    profileUpdate.locationSource = DataSource.RESUME;
  }

  if (Object.keys(profileUpdate).length > 0) {
    await db.profile.update({
      where: { id: profileId },
      data: profileUpdate,
    });
  }

  // 2. Contact info
  if (data.contactInfo?.email || data.contactInfo?.phone) {
    await db.contactInfo.create({
      data: {
        profileId,
        email: data.contactInfo.email ?? null,
        emailSource: DataSource.RESUME,
        phone: data.contactInfo.phone ?? null,
        phoneSource: DataSource.RESUME,
      },
    });
  }

  // 3. Work experiences
  for (let i = 0; i < data.experiences.length; i++) {
    const exp = data.experiences[i];
    await db.workExperience.create({
      data: {
        profileId,
        company: exp.company,
        role: exp.role,
        location: exp.location,
        startDate: parseDateSafe(exp.startDate) ?? new Date(),
        endDate: parseDateSafe(exp.endDate),
        isCurrent: exp.isCurrent ?? false,
        bullets: exp.bullets ?? [],
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 4. Education
  for (let i = 0; i < data.educations.length; i++) {
    const edu = data.educations[i];
    await db.education.create({
      data: {
        profileId,
        institution: edu.institution,
        degree: edu.degree ?? 'Degree',
        fieldOfStudy: edu.fieldOfStudy,
        startDate: parseDateSafe(edu.startDate),
        endDate: parseDateSafe(edu.endDate),
        gpa: edu.gpa,
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 5. Skills
  for (let i = 0; i < data.skills.length; i++) {
    await db.skill.create({
      data: {
        profileId,
        name: data.skills[i],
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 6. Projects
  for (let i = 0; i < data.projects.length; i++) {
    const proj = data.projects[i];
    await db.project.create({
      data: {
        profileId,
        title: proj.name,
        description: proj.description,
        url: proj.url,
        techStack: proj.technologies ?? [],
        startDate: parseDateSafe(proj.startDate),
        endDate: parseDateSafe(proj.endDate),
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 7. Links
  for (let i = 0; i < data.links.length; i++) {
    const link = data.links[i];
    if (!link.url) continue;
    await db.link.create({
      data: {
        profileId,
        type: mapLinkType(link.type),
        url: link.url,
        label: link.label,
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 8. Certifications
  for (let i = 0; i < data.certifications.length; i++) {
    const cert = data.certifications[i];
    await db.certification.create({
      data: {
        profileId,
        name: cert.name,
        issuer: cert.issuer ?? 'Unknown',
        issueDate: parseDateSafe(cert.date),
        source: DataSource.RESUME,
        sortOrder: i,
      },
    });
  }

  // 9. Store raw import payload for debugging
  await db.rawImportPayload.upsert({
    where: {
      profileId_source: { profileId, source: DataSource.RESUME },
    },
    create: {
      profileId,
      source: DataSource.RESUME,
      rawData: data as unknown as Prisma.InputJsonValue,
      status: 'COMPLETED',
      processedAt: new Date(),
    },
    update: {
      rawData: data as unknown as Prisma.InputJsonValue,
      status: 'COMPLETED',
      processedAt: new Date(),
    },
  });
}

// ─── Route Handler ────────────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);
    }

    if (!isAIParserAvailable()) {
      throw new AppError(
        'AI resume parser is not configured. Please add OPENAI_API_KEY to environment variables.',
        'SERVICE_UNAVAILABLE',
        503
      );
    }

    const { resumeId } = await context.params;

    // Verify user owns this resume
    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      throw new AppError('User not found', 'NOT_FOUND', 404);
    }

    const profile = await db.profile.findFirst({
      where: { id: resumeId, userId: user.id },
      select: { id: true },
    });

    if (!profile) {
      throw new AppError('Resume not found', 'NOT_FOUND', 404);
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      throw new AppError('File is required', 'BAD_REQUEST', 400);
    }

    if (file.type !== 'application/pdf') {
      throw new AppError('Only PDF files are supported', 'BAD_REQUEST', 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError('File size must be less than 5 MB', 'BAD_REQUEST', 400);
    }

    importLogger.info('Starting resume import for builder', {
      userId: user.id,
      profileId: profile.id,
      fileName: file.name,
      fileSize: file.size,
    });

    // Parse the resume with AI
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importResumeWithAI(buffer, clerkId);

    if (!result.success || !result.data) {
      throw new AppError(result.error ?? 'Failed to parse resume', 'INTERNAL_ERROR', 500);
    }

    // Clear existing data, then save new data
    await clearProfileData(profile.id);
    await saveResumeDataToProfile(profile.id, result.data);

    importLogger.info('Resume import completed', {
      profileId: profile.id,
      confidence: result.data.meta.confidence,
      experiences: result.data.experiences.length,
      educations: result.data.educations.length,
      skills: result.data.skills.length,
      projects: result.data.projects.length,
    });

    return NextResponse.json({
      success: true,
      confidence: result.data.meta.confidence,
      summary: {
        experiences: result.data.experiences.length,
        educations: result.data.educations.length,
        skills: result.data.skills.length,
        projects: result.data.projects.length,
        certifications: result.data.certifications.length,
        links: result.data.links.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
