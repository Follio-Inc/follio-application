import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  COVER_LETTER_CONTENT_DEFAULTS,
  COVER_LETTER_DESIGN_DEFAULTS,
  DEFAULT_COVER_LETTER_TITLE,
  designFromResumePaper,
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  normalizeCoverLetterVisibility,
  parseCoverLetterDesign,
  type CoverLetterContent,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import { db } from '@/lib/db';
import { resolveDocumentPageLayout } from '@/lib/document-design';
import { handleApiError } from '@/lib/errors';
import { parseResumeDesign } from '@/lib/resume-design';

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  /** Copy shared paper design from this resume (Profile id). */
  matchResumeId: z.string().trim().optional(),
  linkedProfileId: z.string().trim().optional(),
});

function mapCoverLetterListItem(row: {
  id: string;
  title: string;
  updatedAt: Date;
  createdAt: Date;
  design: Prisma.JsonValue;
  linkedProfileId: string | null;
  visibility: string;
  unlistedKey: string | null;
}) {
  const design = parseCoverLetterDesign(row.design);
  const visibility = normalizeCoverLetterVisibility(row.visibility);
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    pageLayout: resolveDocumentPageLayout(design),
    linkedProfileId: row.linkedProfileId,
    visibility,
    // Only expose the opaque key when the letter is actually shareable.
    unlistedKey: visibility === 'UNLISTED' ? row.unlistedKey : null,
  };
}

async function setActiveCoverLetter(
  tx: Prisma.TransactionClient,
  userId: string,
  coverLetterId: string
): Promise<void> {
  await tx.coverLetter.updateMany({
    where: { userId, activeForUserId: userId },
    data: { activeForUserId: null },
  });
  await tx.coverLetter.update({
    where: { id: coverLetterId },
    data: { activeForUserId: userId },
  });
}

/**
 * GET /api/cover-letters — list non-archived cover letters for the user.
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const letters = await db.coverLetter.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        design: true,
        linkedProfileId: true,
        activeForUserId: true,
        visibility: true,
        unlistedKey: true,
      },
    });

    const active = letters.find((l) => l.activeForUserId === user.id);

    return NextResponse.json({
      coverLetters: letters.map(mapCoverLetterListItem),
      activeCoverLetterId: active?.id ?? null,
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters' });
  }
}

/**
 * POST /api/cover-letters — create a blank cover letter (optionally matching a resume design).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        profile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            resumeDesign: true,
          },
        },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = createSchema.parse(await request.json().catch(() => ({})));

    let design: CoverLetterDesign = { ...COVER_LETTER_DESIGN_DEFAULTS };
    let linkedProfileId: string | null = body.linkedProfileId ?? null;

    const matchId = body.matchResumeId ?? body.linkedProfileId ?? user.profile?.id ?? null;
    if (matchId) {
      const profile = await db.profile.findFirst({
        where: { id: matchId, userId: user.id, isArchived: false },
        select: { id: true, resumeDesign: true, firstName: true, lastName: true },
      });
      if (profile) {
        design = designFromResumePaper(parseResumeDesign(profile.resumeDesign));
        linkedProfileId = linkedProfileId ?? profile.id;
      }
    }

    const signatureName = [user.profile?.firstName, user.profile?.lastName]
      .filter(Boolean)
      .join(' ');

    const content: CoverLetterContent = mergeCoverLetterContent({
      ...COVER_LETTER_CONTENT_DEFAULTS,
      signatureName: signatureName || '',
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    });

    const title = body.title?.trim() || DEFAULT_COVER_LETTER_TITLE;

    const created = await db.$transaction(async (tx) => {
      const letter = await tx.coverLetter.create({
        data: {
          userId: user.id,
          title,
          content: content as unknown as Prisma.InputJsonValue,
          design: mergeCoverLetterDesign(design) as unknown as Prisma.InputJsonValue,
          linkedProfileId,
        },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          createdAt: true,
          design: true,
          linkedProfileId: true,
          visibility: true,
          unlistedKey: true,
        },
      });
      await setActiveCoverLetter(tx, user.id, letter.id);
      return letter;
    });

    return NextResponse.json(
      {
        coverLetter: mapCoverLetterListItem(created),
        activeCoverLetterId: created.id,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters' });
  }
}
