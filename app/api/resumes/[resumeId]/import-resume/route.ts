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
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { AppError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { scheduleResumeRefresh } from '@/lib/resume/schedule-refresh';
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

function firstPresent(value: string | undefined): string | null {
  return value ? value : null;
}

/** Keep the first occurrence of each skill name. `(profileId, name)` is unique. */
function uniqueSkillNames(names: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  return unique;
}

/**
 * Replace resume-sourced profile content in one transaction.
 * Clearing first and then inserting row-by-row left a wiped resume when a
 * later insert failed, and each insert was its own round trip.
 */
async function replaceImportedResumeData(
  profileId: string,
  data: NormalizedResumeData
): Promise<void> {
  const processedAt = new Date();
  const skillNames = uniqueSkillNames(data.skills);
  const links = data.links.filter((link) => Boolean(link.url));

  await db.$transaction(async (tx) => {
    // Skills reference SkillGroups via groupId, so delete skills first.
    await tx.skill.deleteMany({ where: { profileId } });
    await tx.skillGroup.deleteMany({ where: { profileId } });
    await tx.workExperience.deleteMany({ where: { profileId } });
    await tx.education.deleteMany({ where: { profileId } });
    await tx.project.deleteMany({ where: { profileId } });
    await tx.certification.deleteMany({ where: { profileId } });
    await tx.link.deleteMany({ where: { profileId } });
    await tx.contactInfo.deleteMany({ where: { profileId } });

    await tx.profile.update({
      where: { id: profileId },
      data: {
        firstName: firstPresent(data.profile.firstName),
        firstNameSource: data.profile.firstName ? DataSource.RESUME : DataSource.MANUAL,
        middleName: firstPresent(data.profile.middleName),
        middleNameSource: data.profile.middleName ? DataSource.RESUME : DataSource.MANUAL,
        lastName: firstPresent(data.profile.lastName),
        lastNameSource: data.profile.lastName ? DataSource.RESUME : DataSource.MANUAL,
        headline: firstPresent(data.profile.headline),
        headlineSource: data.profile.headline ? DataSource.RESUME : DataSource.MANUAL,
        summary: firstPresent(data.profile.summary),
        summarySource: data.profile.summary ? DataSource.RESUME : DataSource.MANUAL,
        location: firstPresent(data.profile.location),
        locationSource: data.profile.location ? DataSource.RESUME : DataSource.MANUAL,
      },
    });

    if (data.contactInfo?.email || data.contactInfo?.phone) {
      await tx.contactInfo.create({
        data: {
          profileId,
          email: data.contactInfo.email ?? null,
          emailSource: DataSource.RESUME,
          phone: data.contactInfo.phone ?? null,
          phoneSource: DataSource.RESUME,
        },
      });
    }

    if (data.experiences.length > 0) {
      await tx.workExperience.createMany({
        data: data.experiences.map((exp, index) => ({
          profileId,
          company: exp.company,
          role: exp.role,
          location: exp.location,
          startDate: parseDateSafe(exp.startDate) ?? processedAt,
          endDate: parseDateSafe(exp.endDate),
          isCurrent: exp.isCurrent ?? false,
          bullets: exp.bullets ?? [],
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    if (data.educations.length > 0) {
      await tx.education.createMany({
        data: data.educations.map((edu, index) => ({
          profileId,
          institution: edu.institution,
          degree: edu.degree ?? 'Degree',
          fieldOfStudy: edu.fieldOfStudy,
          startDate: parseDateSafe(edu.startDate),
          endDate: parseDateSafe(edu.endDate),
          gpa: edu.gpa,
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    if (skillNames.length > 0) {
      await tx.skill.createMany({
        data: skillNames.map((name, index) => ({
          profileId,
          name,
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    if (data.projects.length > 0) {
      await tx.project.createMany({
        data: data.projects.map((proj, index) => ({
          profileId,
          title: proj.name,
          description: proj.description,
          url: proj.url,
          techStack: proj.technologies ?? [],
          startDate: parseDateSafe(proj.startDate),
          endDate: parseDateSafe(proj.endDate),
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    if (links.length > 0) {
      await tx.link.createMany({
        data: links.map((link, index) => ({
          profileId,
          type: mapLinkType(link.type),
          url: link.url,
          label: link.label,
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    if (data.certifications.length > 0) {
      await tx.certification.createMany({
        data: data.certifications.map((cert, index) => ({
          profileId,
          name: cert.name,
          issuer: cert.issuer ?? 'Unknown',
          issueDate: parseDateSafe(cert.date),
          source: DataSource.RESUME,
          sortOrder: index,
        })),
      });
    }

    await tx.rawImportPayload.upsert({
      where: {
        profileId_source: { profileId, source: DataSource.RESUME },
      },
      create: {
        profileId,
        source: DataSource.RESUME,
        rawData: data as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        processedAt,
      },
      update: {
        rawData: data as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        processedAt,
      },
    });
  }, interactiveTransactionOptions);
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

    await replaceImportedResumeData(profile.id, result.data);
    scheduleResumeRefresh(profile.id);

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
