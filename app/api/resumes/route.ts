import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { ensurePrimaryProfile } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { handleApiError, isAppError } from '@/lib/errors';
import { getVanityUsernameForUser } from '@/lib/public-resume';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';
import type { ResumeDesign } from '@/types';
import { createResume, createResumeBodySchema } from '@/services/resume-library.service';

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
    const primaryProfileId = await ensurePrimaryProfile(db, user.id, activeProfileId ?? undefined);

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
        middleName: true,
        lastName: true,
        headline: true,
        updatedAt: true,
        createdAt: true,
        resumeDesign: true,
      },
    });

    const vanityUsername = await getVanityUsernameForUser(user.id);

    return NextResponse.json({
      resumes: resumes.map((r) => ({
        id: r.id,
        handle: r.handle,
        resumeTitle: r.resumeTitle,
        status: r.status,
        resumeVisibility: r.resumeVisibility,
        firstName: r.firstName,
        middleName: r.middleName,
        lastName: r.lastName,
        headline: r.headline,
        updatedAt: r.updatedAt,
        createdAt: r.createdAt,
        pageLayout: resolveResumePageLayout((r.resumeDesign as ResumeDesign | null) ?? null),
      })),
      activeProfileId,
      primaryProfileId,
      vanityUsername,
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
    const parsed = createResumeBodySchema.safeParse(rawBody);

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

    const result = await createResume({
      userId: user.id,
      email: user.email,
      strategy: body.strategy,
      title: body.title,
      sourceProfileId: body.sourceProfileId,
      resumeDesign: body.resumeDesign,
      activate: true,
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
    if (isAppError(error) && error.statusCode === 404) {
      return NextResponse.json({ error: 'Source resume not found' }, { status: 404 });
    }
    return handleApiError(error, { method: 'POST', path: '/api/resumes' });
  }
}
