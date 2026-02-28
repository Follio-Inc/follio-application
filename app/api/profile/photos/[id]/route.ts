import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';

/**
 * PATCH /api/profile/photos/[id]
 * Update a photo (caption, visibility, sortOrder)
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

    const photo = await db.profilePhoto.update({
      where: { id },
      data: {
        ...allowedFields,
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

    await db.profilePhoto.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting photo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
