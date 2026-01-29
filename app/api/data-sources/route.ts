import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/data-sources
 * Get all data source connections for the current user's profile
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            dataSourceConnections: true,
          },
        },
      },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Return the data source connections
    return NextResponse.json({
      connections: user.profile.dataSourceConnections,
    });
  } catch (error) {
    console.error('Error fetching data sources:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
