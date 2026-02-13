import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

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

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            photos: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ photos: user.profile.photos });
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
    const { url, caption, category } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const validCategory = category === 'PROFILE' || category === 'GALLERY' ? category : 'GALLERY';

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get the highest sortOrder for the category
    const lastPhoto = await db.profilePhoto.findFirst({
      where: { profileId: user.profile.id, category: validCategory },
      orderBy: { sortOrder: 'desc' },
    });

    const photo = await db.profilePhoto.create({
      data: {
        profileId: user.profile.id,
        url,
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
