import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { inferJobTitleHint, scoreProfilesAgainstJd } from '@/lib/jd-match';

const bodySchema = z.object({
  jobDescription: z.string().trim().min(40).max(80_000),
  pageUrl: z.string().url().optional().nullable(),
});

const profileInclude = {
  skills: { select: { name: true, isVisible: true } },
  workExperiences: {
    select: {
      company: true,
      role: true,
      bullets: true,
      bulletsHtml: true,
      isVisible: true,
    },
  },
  projects: {
    select: {
      title: true,
      description: true,
      techStack: true,
      highlights: true,
      isVisible: true,
      showOnResume: true,
    },
  },
  educations: {
    select: {
      institution: true,
      degree: true,
      fieldOfStudy: true,
      isVisible: true,
    },
  },
  certifications: {
    select: {
      name: true,
      issuer: true,
      isVisible: true,
    },
  },
} as const;

/**
 * POST /api/extension/match-jd
 *
 * Score every non-archived resume against a job description from the current page.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { jobDescription, pageUrl } = parsed.data;

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profiles = await db.profile.findMany({
      where: {
        userId: user.id,
        isArchived: false,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        handle: true,
        resumeTitle: true,
        headline: true,
        summary: true,
        ...profileInclude,
      },
    });

    if (profiles.length === 0) {
      return NextResponse.json({
        pageUrl: pageUrl ?? null,
        jobTitleHint: inferJobTitleHint(jobDescription),
        jdPreview: jobDescription.slice(0, 280),
        results: [],
        scoredAt: new Date().toISOString(),
      });
    }

    const results = scoreProfilesAgainstJd(profiles, jobDescription);

    return NextResponse.json({
      pageUrl: pageUrl ?? null,
      jobTitleHint: inferJobTitleHint(jobDescription),
      jdPreview: jobDescription.slice(0, 280),
      results,
      scoredAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/extension/match-jd' });
  }
}
