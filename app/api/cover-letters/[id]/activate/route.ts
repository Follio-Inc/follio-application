import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';

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
    const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const letter = await db.coverLetter.findFirst({
      where: { id, userId: user.id, isArchived: false },
      select: { id: true },
    });
    if (!letter) {
      return NextResponse.json({ error: 'Cover letter not found' }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await tx.coverLetter.updateMany({
        where: { userId: user.id, activeForUserId: user.id },
        data: { activeForUserId: null },
      });
      await tx.coverLetter.update({
        where: { id },
        data: { activeForUserId: user.id },
      });
    });

    return NextResponse.json({ success: true, activeCoverLetterId: id });
  } catch (error) {
    return handleApiError(error, { path: '/api/cover-letters/[id]/activate' });
  }
}
