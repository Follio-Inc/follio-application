/**
 * API Route: /api/profile/unlisted-key
 *
 * GET  - Get the unlisted key for the current user's profile
 * POST - Regenerate the unlisted key (invalidates old unlisted links)
 */

import { db } from '@/lib/db';
import { getOrCreateUnlistedKey, regenerateUnlistedKey } from '@/services/profile.service';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

async function getProfile(clerkId: string) {
  const user = await db.user.findUnique({
    where: { clerkId },
    include: { profile: { select: { id: true, unlistedKey: true, handle: true } } },
  });
  return user?.profile ?? null;
}

/**
 * GET /api/profile/unlisted-key
 * Returns the current unlisted key for the authenticated user's profile
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const key = await getOrCreateUnlistedKey(profile.id);

    return NextResponse.json({
      success: true,
      unlistedKey: key,
      handle: profile.handle,
    });
  } catch (error) {
    console.error('Error getting unlisted key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/unlisted-key
 * Regenerate the unlisted key (invalidates all existing unlisted links)
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const newKey = await regenerateUnlistedKey(profile.id);

    return NextResponse.json({
      success: true,
      unlistedKey: newKey,
      handle: profile.handle,
    });
  } catch (error) {
    console.error('Error regenerating unlisted key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
