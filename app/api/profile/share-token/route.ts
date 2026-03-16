import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// GET - Get current share token for user
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        shareTokens: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = await db.profile.findUnique({
      where: { id: profileId },
      select: { handle: true },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const activeToken = user.shareTokens[0] || null;

    return NextResponse.json({
      token: activeToken?.token || null,
      handle: profile.handle,
      expiresAt: activeToken?.expiresAt || null,
      viewCount: activeToken?.viewCount || 0,
    });
  } catch (error) {
    console.error('Error fetching share token:', error);
    return NextResponse.json({ error: 'Failed to fetch share token' }, { status: 500 });
  }
}

// POST - Generate a new share token
export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = await db.profile.findUnique({
      where: { id: profileId },
      select: { handle: true },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Parse optional settings
    let expiresAt: Date | null = null;
    let maxViews: number | null = null;

    try {
      const body = await request.json();
      if (body.expiresIn) {
        // expiresIn is in days
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + body.expiresIn);
      }
      if (body.maxViews) {
        maxViews = body.maxViews;
      }
    } catch {
      // No body or invalid JSON - use defaults (no expiry, no max views)
    }

    // Create new token
    const shareToken = await db.shareToken.create({
      data: {
        userId: user.id,
        expiresAt,
        maxViews,
      },
    });

    return NextResponse.json({
      token: shareToken.token,
      handle: profile.handle,
      expiresAt: shareToken.expiresAt,
      maxViews: shareToken.maxViews,
      viewCount: 0,
    });
  } catch (error) {
    console.error('Error creating share token:', error);
    return NextResponse.json({ error: 'Failed to create share token' }, { status: 500 });
  }
}

// DELETE - Revoke a share token
export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (token) {
      // Delete specific token
      await db.shareToken.deleteMany({
        where: {
          userId: user.id,
          token,
        },
      });
    } else {
      // Delete all tokens for user
      await db.shareToken.deleteMany({
        where: { userId: user.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking share token:', error);
    return NextResponse.json({ error: 'Failed to revoke share token' }, { status: 500 });
  }
}
