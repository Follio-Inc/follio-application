import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isCoverLetterVisibility,
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  normalizeCoverLetterVisibility,
  parseCoverLetterContent,
  parseCoverLetterDesign,
  type CoverLetterContent,
} from '@/lib/cover-letter';
import { db } from '@/lib/db';
import { resolveDocumentPageLayout } from '@/lib/document-design';
import { handleApiError } from '@/lib/errors';

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.record(z.unknown()).optional(),
  linkedProfileId: z.string().trim().nullable().optional(),
  isArchived: z.boolean().optional(),
  /** PRIVATE | UNLISTED only — PUBLIC is rejected. */
  visibility: z.enum(['PRIVATE', 'UNLISTED']).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedCoverLetter(clerkId: string, id: string) {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) return { user: null, letter: null };

  const letter = await db.coverLetter.findFirst({
    where: { id, userId: user.id },
  });
  return { user, letter };
}

/**
 * GET /api/cover-letters/[id]
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { letter } = await getOwnedCoverLetter(clerkId, id);
    if (!letter || letter.isArchived) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const content = mergeCoverLetterContent(parseCoverLetterContent(letter.content));
    const design = mergeCoverLetterDesign(parseCoverLetterDesign(letter.design));

    return NextResponse.json({
      coverLetter: {
        id: letter.id,
        title: letter.title,
        content,
        design,
        linkedProfileId: letter.linkedProfileId,
        visibility: normalizeCoverLetterVisibility(letter.visibility),
        pageLayout: resolveDocumentPageLayout(design),
        updatedAt: letter.updatedAt.toISOString(),
        createdAt: letter.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]' });
  }
}

/**
 * PATCH /api/cover-letters/[id] — title, content, archive, linked resume.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { user, letter } = await getOwnedCoverLetter(clerkId, id);
    if (!user || !letter || letter.isArchived) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const body = patchSchema.parse(await request.json());

    // Explicit guard — PUBLIC must never be accepted for cover letters.
    if (body.visibility !== undefined && !isCoverLetterVisibility(body.visibility)) {
      return NextResponse.json(
        { error: 'Cover letters support PRIVATE or UNLISTED only' },
        { status: 400 }
      );
    }

    const data: Prisma.CoverLetterUpdateInput = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.visibility !== undefined) data.visibility = body.visibility;
    if (body.isArchived !== undefined) {
      data.isArchived = body.isArchived;
      if (body.isArchived) data.activeForUserId = null;
    }
    if (body.linkedProfileId !== undefined) {
      if (body.linkedProfileId === null) {
        data.linkedProfile = { disconnect: true };
      } else {
        const profile = await db.profile.findFirst({
          where: { id: body.linkedProfileId, userId: user.id, isArchived: false },
          select: { id: true },
        });
        if (!profile) {
          return NextResponse.json({ error: 'Resume not found' }, { status: 400 });
        }
        data.linkedProfile = { connect: { id: profile.id } };
      }
    }
    if (body.content !== undefined) {
      const existing = parseCoverLetterContent(letter.content) ?? {};
      const merged = mergeCoverLetterContent({
        ...existing,
        ...(body.content as CoverLetterContent),
      });
      data.content = merged as unknown as Prisma.InputJsonValue;
    }

    const updated = await db.coverLetter.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      coverLetter: {
        id: updated.id,
        title: updated.title,
        content: mergeCoverLetterContent(parseCoverLetterContent(updated.content)),
        design: mergeCoverLetterDesign(parseCoverLetterDesign(updated.design)),
        linkedProfileId: updated.linkedProfileId,
        visibility: normalizeCoverLetterVisibility(updated.visibility),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]' });
  }
}

/**
 * DELETE /api/cover-letters/[id] — soft-archive.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { letter } = await getOwnedCoverLetter(clerkId, id);
    if (!letter || letter.isArchived) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    await db.coverLetter.update({
      where: { id },
      data: { isArchived: true, activeForUserId: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]' });
  }
}
