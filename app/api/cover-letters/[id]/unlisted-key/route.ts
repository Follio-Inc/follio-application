/**
 * API Route: /api/cover-letters/[id]/unlisted-key
 *
 * GET  - Get (or create) the unlisted key for this cover letter
 * POST - Regenerate the unlisted key (invalidates old /cl/{key} links)
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { handleApiError } from '@/lib/errors';
import {
  getOrCreateCoverLetterUnlistedKey,
  regenerateCoverLetterUnlistedKey,
  resolveOwnedCoverLetterSelect,
} from '@/services/cover-letter.service';

type RouteContext = { params: Promise<{ id: string }> };

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
    const owned = await resolveOwnedCoverLetterSelect(clerkId, id, {
      id: true,
      visibility: true,
    });
    if (!owned?.letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const unlistedKey = await getOrCreateCoverLetterUnlistedKey(id, owned.userId);
    if (!unlistedKey) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      unlistedKey,
      visibility: owned.letter.visibility === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE',
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
    const owned = await resolveOwnedCoverLetterSelect(clerkId, id, {
      id: true,
      visibility: true,
    });
    if (!owned?.letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    const unlistedKey = await regenerateCoverLetterUnlistedKey(id, owned.userId);
    if (!unlistedKey) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      unlistedKey,
      visibility: owned.letter.visibility === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE',
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/unlisted-key', method: 'POST' });
  }
}
