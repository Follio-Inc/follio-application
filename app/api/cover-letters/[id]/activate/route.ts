import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { handleApiError } from '@/lib/errors';
import {
  resolveOwnedCoverLetterSelect,
  setActiveCoverLetter,
} from '@/services/cover-letter.service';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/cover-letters/[id]/activate — set as the user's active cover letter.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const owned = await resolveOwnedCoverLetterSelect(clerkId, id, { id: true });
    if (!owned) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!owned.letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    await setActiveCoverLetter(owned.userId, id);

    return NextResponse.json({ success: true, activeCoverLetterId: id });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/activate' });
  }
}
