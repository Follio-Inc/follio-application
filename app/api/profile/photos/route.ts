import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';

/**
 * GET /api/profile/photos
 * Get all photos for the current user's profile
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const photos = await db.profilePhoto.findMany({
      where: { profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ photos });
  } catch (error) {
    console.error('Error fetching photos:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/photos
 * Upload a new photo (stores the URL — actual file upload happens client-side)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, caption, category, originalUrl, adjustments } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const validCategory = category === 'PROFILE' || category === 'GALLERY' ? category : 'GALLERY';

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Both PROFILE and GALLERY photos accumulate. Users can upload multiple
    // profile photos and switch between them (selection lives on Profile.avatarUrl).

    // Get the highest sortOrder for the category
    const lastPhoto = await db.profilePhoto.findFirst({
      where: { profileId, category: validCategory },
      orderBy: { sortOrder: 'desc' },
    });

    const photo = await db.profilePhoto.create({
      data: {
        profileId,
        url,
        originalUrl: typeof originalUrl === 'string' ? originalUrl : undefined,
        adjustments: adjustments && typeof adjustments === 'object' ? adjustments : undefined,
        caption: caption || null,
        category: validCategory,
        source: 'MANUAL',
        sortOrder: (lastPhoto?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ success: true, photo }, { status: 201 });
  } catch (error) {
    console.error('Error creating photo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
