import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * PATCH /api/import/medium/[postId]
 *
 * Toggle visibility or update a single blog post.
 *
 * Body: { "isVisible": boolean, "isFeatured"?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId } = await params;
    const body = await request.json();

    // Verify the post belongs to this user
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const post = await db.blogPost.findFirst({
      where: { id: postId, profileId: user.profile.id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Blog post not found' }, { status: 404 });
    }

    // Build update data from allowed fields
    const updateData: Record<string, unknown> = {};
    if (typeof body.isVisible === 'boolean') updateData.isVisible = body.isVisible;
    if (typeof body.isFeatured === 'boolean') updateData.isFeatured = body.isFeatured;

    const updated = await db.blogPost.update({
      where: { id: postId },
      data: updateData,
    });

    return NextResponse.json({ success: true, post: updated });
  } catch (error) {
    console.error('[Medium PATCH] Error:', error);
    return NextResponse.json({ error: 'Failed to update blog post' }, { status: 500 });
  }
}
