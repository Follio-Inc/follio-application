import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { AppError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { setExclusiveResumeVisibility } from '@/lib/public-resume';
import { deleteResumes } from '@/services/resume-delete.service';
import { renameResume } from '@/services/resume-rename.service';

const resumeLogger = logger.child({ source: 'api-resume-crud' });

interface RouteContext {
  params: Promise<{ resumeId: string }>;
}

const updateResumeSchema = z.object({
  resumeTitle: z.string().trim().min(1, 'Title is required').max(120).optional(),
  isArchived: z.boolean().optional(),
  resumeVisibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
});

/**
 * PATCH /api/resumes/[resumeId]
 * Update resume metadata (title, archive status) and visibility.
 * Visibility is shared with the Follio when this resume is attached.
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

    let replacedPublicResume: Awaited<
      ReturnType<typeof setExclusiveResumeVisibility>
    >['replacedPublicResume'] = null;

    if (parsed.data.resumeVisibility) {
      const result = await setExclusiveResumeVisibility(profile.id, parsed.data.resumeVisibility);
      replacedPublicResume = result.replacedPublicResume;
    }

    // Shared with the MCP rename_resume tool: no two non-archived resumes can share a title.
    // the website's rename functionality call renmeResume, which is also used by the MCP
    if (parsed.data.resumeTitle !== undefined) {
      try {
        await renameResume(user.id, profile.id, parsed.data.resumeTitle);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 409) {
          // The rename boxes read `error` as text, so keep this reply's shape.
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }
    }

    const select = { id: true, resumeTitle: true, handle: true, isArchived: true } as const;
    const updated =
      parsed.data.isArchived !== undefined
        ? await db.profile.update({
            where: { id: profile.id },
            data: { isArchived: parsed.data.isArchived },
            select,
          })
        : await db.profile.findUniqueOrThrow({ where: { id: profile.id }, select });

    resumeLogger.info('Updated resume', {
      userId: user.id,
      profileId: profile.id,
      changes: parsed.data,
    });

    return NextResponse.json({ success: true, resume: updated, replacedPublicResume });
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ownership, the last-resume rule, and re-pointing the builder and portfolio all live in the
    // shared service, so the MCP delete_resumes tool follows the same rules.
    await deleteResumes(user.id, [resumeId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, {
      method: 'DELETE',
      path: '/api/resumes/[resumeId]',
    });
  }
}
