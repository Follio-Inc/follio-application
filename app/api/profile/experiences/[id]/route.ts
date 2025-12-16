import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { WorkExperienceSchema } from '@/lib/validations';

/**
 * PATCH /api/profile/experiences/[id]
 * Update a work experience
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = WorkExperienceSchema.partial().safeParse(body);

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

    // Verify the experience belongs to the user's profile
    const existingExperience = await db.workExperience.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingExperience) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    const experience = await db.workExperience.update({
      where: { id },
      data: {
        ...validatedData.data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, experience });
  } catch (error) {
    console.error('Error updating experience:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/experiences/[id]
 * Delete a work experience
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

    // Verify the experience belongs to the user's profile
    const existingExperience = await db.workExperience.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingExperience) {
      return NextResponse.json({ error: 'Experience not found' }, { status: 404 });
    }

    await db.workExperience.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting experience:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
