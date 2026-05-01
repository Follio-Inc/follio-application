import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';

/**
 * GET /api/profile/photos/[id]
 * Returns photo metadata — specifically the persisted editor adjustments.
 * The image binary is served separately via /api/photos/[id].
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const photo = await db.profilePhoto.findFirst({
      where: { id, profileId },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: photo.id,
      adjustments: photo.adjustments ?? null,
      hasOriginal: !!photo.originalUrl,
    });
  } catch (error) {
    console.error('Error fetching photo metadata:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/profile/photos/[id]
 * Update a photo (caption, visibility, sortOrder, url, originalUrl, adjustments)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the photo belongs to the user's profile
    const existingPhoto = await db.profilePhoto.findFirst({
      where: { id, profileId },
    });

    if (!existingPhoto) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const allowedFields: Record<string, unknown> = {};
    if (typeof body.caption === 'string' || body.caption === null)
      allowedFields.caption = body.caption;
    if (typeof body.isVisible === 'boolean') allowedFields.isVisible = body.isVisible;
    if (typeof body.sortOrder === 'number') allowedFields.sortOrder = body.sortOrder;
    if (typeof body.url === 'string') allowedFields.url = body.url;
    if (typeof body.originalUrl === 'string') allowedFields.originalUrl = body.originalUrl;
    if (body.adjustments !== undefined) {
      // Accept object or null (to clear adjustments)
      allowedFields.adjustments =
        body.adjustments && typeof body.adjustments === 'object' ? body.adjustments : null;
    }

    const photo = await db.profilePhoto.update({
      where: { id },
      data: {
        ...(allowedFields as Record<string, unknown>),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, photo });
  } catch (error) {
    console.error('Error updating photo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/photos/[id]
 * Delete a photo
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the photo belongs to the user's profile
    const existingPhoto = await db.profilePhoto.findFirst({
      where: { id, profileId },
    });

    if (!existingPhoto) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Prevent deletion if this photo is the active avatar on any profile.
    // The serving URL format is `/api/photos/<id>` (may include cache-bust params).
    const servingUrl = `/api/photos/${id}`;
    const profilesUsingPhoto = await db.profile.findMany({
      where: {
        OR: [{ avatarUrl: { startsWith: servingUrl } }, { avatarUrl: existingPhoto.url }],
      },
      select: { id: true, handle: true, resumeTitle: true },
    });

    if (profilesUsingPhoto.length > 0) {
      const isCurrentProfile = profilesUsingPhoto.some((p) => p.id === profileId);
      const otherProfiles = profilesUsingPhoto.filter((p) => p.id !== profileId);

      if (otherProfiles.length > 0) {
        const names = otherProfiles.map((p) => p.resumeTitle || p.handle).join(', ');
        return NextResponse.json(
          {
            error: 'Photo in use',
            message: `This photo is currently used in: ${names}. Please change the photo there first.`,
          },
          { status: 409 }
        );
      }
      if (isCurrentProfile) {
        return NextResponse.json(
          {
            error: 'Photo in use',
            message:
              'This photo is your current profile photo. Please select a different photo first.',
          },
          { status: 409 }
        );
      }
    }

    await db.profilePhoto.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
