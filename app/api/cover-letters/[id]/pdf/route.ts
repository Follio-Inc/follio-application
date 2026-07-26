import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { contentDispositionAttachment } from '@/app/api/export/[handle]/access';
import { parseCoverLetterContent, parseCoverLetterDesign } from '@/lib/cover-letter';
import { formatDocumentDownloadFilename } from '@/lib/document-download/filename';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { generateCoverLetterPDF } from '@/services/cover-letter-export.service';
import type { PdfLayout } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_LAYOUTS = new Set<string>(['continuous', 'a4', 'letter', 'paged']);

function normalizeLayoutParam(raw: string): PdfLayout {
  if (raw === 'continuous' || raw === 'a4' || raw === 'letter') return raw;
  return 'letter';
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/cover-letters/[id]/pdf?layout=…&key=…
 *
 * Access:
 * - Owner (authenticated) always
 * - Unlisted visitors with matching `key` when visibility === UNLISTED
 * Cover letters are never PUBLIC.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const key = request.nextUrl.searchParams.get('key')?.trim() || null;

    const letter = await db.coverLetter.findFirst({
      where: { id, isArchived: false },
      select: {
        id: true,
        title: true,
        content: true,
        design: true,
        userId: true,
        visibility: true,
        unlistedKey: true,
      },
    });
    if (!letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const { userId: clerkId } = await auth();
    let isOwner = false;
    if (clerkId) {
      const user = await db.user.findUnique({
        where: { clerkId },
        select: { id: true },
      });
      isOwner = user?.id === letter.userId;
    }

    const isUnlistedVisitor =
      !isOwner &&
      letter.visibility === 'UNLISTED' &&
      Boolean(key) &&
      Boolean(letter.unlistedKey) &&
      key === letter.unlistedKey;

    if (!isOwner && !isUnlistedVisitor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const layoutParam = request.nextUrl.searchParams.get('layout') ?? 'letter';
    const layout = VALID_LAYOUTS.has(layoutParam)
      ? normalizeLayoutParam(layoutParam)
      : ('letter' as PdfLayout);

    const pdfBuffer = await generateCoverLetterPDF(
      parseCoverLetterContent(letter.content),
      parseCoverLetterDesign(letter.design),
      { layout }
    );

    const filename = `${formatDocumentDownloadFilename(letter.title, 'Cover_Letter')}.pdf`;
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDispositionAttachment(filename),
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/pdf', method: 'GET' });
  }
}
