import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { LinkSchema } from '@/lib/validations';

/**
 * PATCH /api/profile/links/[id]
 * Update a link
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = LinkSchema.partial().safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the link belongs to the user's profile
    const existingLink = await db.link.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // Check for duplicate URL (if URL is being updated)
    if (validatedData.data.url) {
      const duplicateLink = await db.link.findFirst({
        where: {
          profileId: user.profile.id,
          url: { equals: validatedData.data.url, mode: 'insensitive' },
          id: { not: id }, // Exclude the current link being updated
        },
      });

      if (duplicateLink) {
        return NextResponse.json(
          { error: 'This URL already exists in your links' },
          { status: 400 }
        );
      }
    }

    const link = await db.link.update({
      where: { id },
      data: {
        ...validatedData.data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, link });
  } catch (error) {
    console.error('Error updating link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/links/[id]
 * Delete a link
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the link belongs to the user's profile
    const existingLink = await db.link.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingLink) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    await db.link.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
