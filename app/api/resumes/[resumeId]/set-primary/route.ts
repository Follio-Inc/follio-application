import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const setPrimaryLogger = logger.child({ source: 'api-resume-set-primary' });

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

/**
 * PATCH /api/resumes/[resumeId]/set-primary
 *
 * Designate a resume as the user's stable "primary" (portfolio) profile. This
 * backs the user-facing Portfolio surface and is independent of the transient
 * "active" profile used by the builder.
 */
export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resumeId } = await context.params;

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetProfile = await db.profile.findFirst({
      where: {
        id: resumeId,
        userId: user.id,
        isArchived: false,
      },
      select: { id: true },
    });

    if (!targetProfile) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Guarantee the target is renderable as a portfolio BEFORE repointing the
    // pointer, so we never expose a "portfolio not found" page. If this fails we
    // surface the error and leave the existing portfolio untouched.
    await makeProfilePortfolioReady(targetProfile.id);

    await db.user.update({
      where: { id: user.id },
      data: {
        primaryProfile: {
          connect: { id: targetProfile.id },
        },
      },
    });

    setPrimaryLogger.info('Set primary (portfolio) profile', {
      userId: user.id,
      profileId: targetProfile.id,
    });

    return NextResponse.json({ success: true, primaryProfileId: targetProfile.id });
  } catch (error) {
    return handleApiError(error, {
      method: 'PATCH',
      path: '/api/resumes/[resumeId]/set-primary',
    });
  }
}
