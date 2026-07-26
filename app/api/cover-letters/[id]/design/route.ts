import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import {
  COVER_LETTER_DESIGN_DEFAULTS,
  mergeCoverLetterDesign,
  parseCoverLetterDesign,
  validateCoverLetterDesignPatch,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { resolveOwnedCoverLetterSelect } from '@/services/cover-letter.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/cover-letters/[id]/design
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const owned = await resolveOwnedCoverLetterSelect(clerkId, id, { design: true });
    if (!owned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!owned.letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const design: CoverLetterDesign = {
      ...COVER_LETTER_DESIGN_DEFAULTS,
      ...(parseCoverLetterDesign(owned.letter.design) ?? {}),
    };

    return NextResponse.json({ design });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/design' });
  }
}

/**
 * PATCH /api/cover-letters/[id]/design — merge partial design update.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { valid, data, error } = validateCoverLetterDesignPatch(body);
    if (!valid || !data) {
      return NextResponse.json({ error: error ?? 'Validation failed' }, { status: 400 });
    }

    const { id } = await context.params;
    const owned = await resolveOwnedCoverLetterSelect(clerkId, id, { id: true, design: true });
    if (!owned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!owned.letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const merged = mergeCoverLetterDesign({
      ...(parseCoverLetterDesign(owned.letter.design) ?? {}),
      ...data,
    });

    await db.coverLetter.update({
      where: { id },
      data: {
        design: merged as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, design: merged });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/design' });
  }
}
