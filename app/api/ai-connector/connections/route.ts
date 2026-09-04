import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { listConnectorConnections } from '@/services/ai-connector.service';

export const dynamic = 'force-dynamic';

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

    const connections = await listConnectorConnections(user.id);
    return NextResponse.json({ connections });
  } catch (error) {
    return handleApiError(error);
  }
}
