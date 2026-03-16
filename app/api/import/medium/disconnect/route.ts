import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/medium/disconnect
 *
 * Remove all blog posts for a given platform and delete the data source connection.
 *
 * Body: { "platform": "medium" | "devto" | "substack" | "hashnode" }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { platform } = body;

    if (!platform) {
      return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileId = user.profile.id;

    // Delete all blog posts for this platform
    const deleted = await db.blogPost.deleteMany({
      where: {
        profileId,
        platform: platform.toUpperCase(),
      },
    });

    // Also try with lowercase (in case platform was stored differently)
    if (deleted.count === 0) {
      await db.blogPost.deleteMany({
        where: {
          profileId,
          platform: { equals: platform, mode: 'insensitive' },
        },
      });
    }

    // Remove data source connection if no blog posts remain
    const remainingPosts = await db.blogPost.count({ where: { profileId } });
    if (remainingPosts === 0) {
      await db.dataSourceConnection.deleteMany({
        where: { profileId, source: 'BLOG' },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Disconnected ${platform}. Removed ${deleted.count} posts.`,
    });
  } catch (error) {
    console.error('[Medium Disconnect] Error:', error);
    return NextResponse.json({ error: 'Failed to disconnect source' }, { status: 500 });
  }
}
