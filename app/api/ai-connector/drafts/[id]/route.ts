import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { applyDraft, discardDraft } from '@/services/ai-connector.service';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  action: z.enum(['apply', 'discard']),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const { id } = await context.params;
    const body = PatchSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (body.data.action === 'apply') {
      const result = await applyDraft(user.id, id);
      return NextResponse.json(result);
    }

    const result = await discardDraft(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
