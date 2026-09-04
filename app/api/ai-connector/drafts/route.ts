import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { listDrafts } from '@/services/ai-connector.service';

export const dynamic = 'force-dynamic';

async function requireLocalUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return { userId: user.id };
}

export async function GET() {
  try {
    const result = await requireLocalUser();
    if ('error' in result) return result.error;
    const drafts = await listDrafts(result.userId, true);
    return NextResponse.json({ drafts });
  } catch (error) {
    return handleApiError(error);
  }
}
