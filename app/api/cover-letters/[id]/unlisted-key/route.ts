/**
 * API Route: /api/cover-letters/[id]/unlisted-key
 *
 * GET  - Get (or create) the unlisted key for this cover letter
 * POST - Regenerate the unlisted key (invalidates old /cl/{key} links)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import {
  getOrCreateCoverLetterUnlistedKey,
  regenerateCoverLetterUnlistedKey,
} from '@/services/cover-letter.service';

type RouteContext = { params: Promise<{ id: string }> };

async function resolveOwnerLetter(clerkId: string, id: string) {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) return { user: null, letter: null };

  const letter = await db.coverLetter.findFirst({
    where: { id, userId: user.id, isArchived: false },
    select: { id: true, visibility: true },
  });
  return { user, letter };
}

/**
 * GET /api/cover-letters/[id]/unlisted-key
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { user, letter } = await resolveOwnerLetter(clerkId, id);
    if (!user || !letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const unlistedKey = await getOrCreateCoverLetterUnlistedKey(id, user.id);
    if (!unlistedKey) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      unlistedKey,
      visibility: letter.visibility === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE',
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/unlisted-key', method: 'GET' });
  }
}

/**
 * POST /api/cover-letters/[id]/unlisted-key — regenerate key.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { user, letter } = await resolveOwnerLetter(clerkId, id);
    if (!user || !letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const unlistedKey = await regenerateCoverLetterUnlistedKey(id, user.id);
    if (!unlistedKey) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      unlistedKey,
      visibility: letter.visibility === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE',
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/unlisted-key', method: 'POST' });
  }
}
