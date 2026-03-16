import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/data-sources/disconnect
 * Disconnect a data source
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { source } = body;

    if (!source) {
      return NextResponse.json({ error: 'Source is required' }, { status: 400 });
    }

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Update connection status
    await db.dataSourceConnection.updateMany({
      where: {
        profileId,
        source: source,
      },
      data: {
        status: 'DISCONNECTED',
        accessToken: null,
        refreshToken: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting data source:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
