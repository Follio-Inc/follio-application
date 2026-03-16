import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const resumeActivationLogger = logger.child({ source: 'api-resume-activation' });

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

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

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          profile: {
            connect: { id: targetProfile.id },
          },
        },
      });
    });

    resumeActivationLogger.info('Activated resume', {
      userId: user.id,
      profileId: targetProfile.id,
    });

    return NextResponse.json({ success: true, activeProfileId: targetProfile.id });
  } catch (error) {
    return handleApiError(error, {
      method: 'PATCH',
      path: '/api/resumes/[resumeId]/activate',
    });
  }
}
