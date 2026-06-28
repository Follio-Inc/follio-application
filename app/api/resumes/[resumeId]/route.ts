import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const resumeLogger = logger.child({ source: 'api-resume-crud' });

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

const updateResumeSchema = z.object({
  resumeTitle: z.string().trim().min(1, 'Title is required').max(120).optional(),
  isArchived: z.boolean().optional(),
});

/**
 * PATCH /api/resumes/[resumeId]
 * Update resume metadata (title, archive status)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const body = await request.json();
    const parsed = updateResumeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const profile = await db.profile.findFirst({
      where: { id: resumeId, userId: user.id },
      select: { id: true, resumeTitle: true },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Uniqueness check: no two non-archived resumes for the same user can share a title
    if (parsed.data.resumeTitle && parsed.data.resumeTitle !== profile.resumeTitle) {
      const duplicate = await db.profile.findFirst({
        where: {
          userId: user.id,
          resumeTitle: parsed.data.resumeTitle,
          isArchived: false,
          id: { not: profile.id },
        },
        select: { id: true },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: 'A resume with this name already exists. Please choose a different name.' },
          { status: 409 }
        );
      }
    }

    const updated = await db.profile.update({
      where: { id: profile.id },
      data: {
        ...(parsed.data.resumeTitle !== undefined && { resumeTitle: parsed.data.resumeTitle }),
        ...(parsed.data.isArchived !== undefined && { isArchived: parsed.data.isArchived }),
      },
      select: {
        id: true,
        resumeTitle: true,
        handle: true,
        isArchived: true,
      },
    });

    resumeLogger.info('Updated resume', {
      userId: user.id,
      profileId: profile.id,
      changes: parsed.data,
    });

    return NextResponse.json({ success: true, resume: updated });
  } catch (error) {
    return handleApiError(error, {
      method: 'PATCH',
      path: '/api/resumes/[resumeId]',
    });
  }
}

/**
 * DELETE /api/resumes/[resumeId]
 * Delete a resume and all its associated data.
 * Cannot delete the user's last remaining resume.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { resumeId } = await context.params;

    const user = await db.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        profile: { select: { id: true } },
        primaryProfile: { select: { id: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify ownership
    const profile = await db.profile.findFirst({
      where: { id: resumeId, userId: user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 });
    }

    // Prevent deleting the last resume
    const resumeCount = await db.profile.count({
      where: { userId: user.id },
    });

    if (resumeCount <= 1) {
      return NextResponse.json({ error: 'Cannot delete your only resume' }, { status: 400 });
    }

    const wasActive = user.profile?.id === profile.id;
    const wasPrimary = user.primaryProfile?.id === profile.id;

    // Delete the profile (cascades to all related data via Prisma schema)
    await db.profile.delete({
      where: { id: profile.id },
    });

    // If the deleted resume was active and/or the portfolio (primary), re-point
    // those pointers at the oldest remaining resume so the dashboard and
    // builder always resolve to a valid profile.
    if (wasActive || wasPrimary) {
      const nextProfile = await db.profile.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (nextProfile) {
        // The replacement portfolio profile may be a DRAFT resume with no
        // generated portfolio — make it renderable before it becomes primary so
        // the portfolio link keeps working after deletion.
        if (wasPrimary) {
          await makeProfilePortfolioReady(nextProfile.id);
        }

        await db.user.update({
          where: { id: user.id },
          data: {
            ...(wasActive && { profile: { connect: { id: nextProfile.id } } }),
            ...(wasPrimary && { primaryProfile: { connect: { id: nextProfile.id } } }),
          },
        });
      }
    }

    resumeLogger.info('Deleted resume', {
      userId: user.id,
      profileId: resumeId,
      wasActive,
      wasPrimary,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      method: 'DELETE',
      path: '/api/resumes/[resumeId]',
    });
  }
}
