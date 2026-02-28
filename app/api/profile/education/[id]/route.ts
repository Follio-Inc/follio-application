import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { EducationSchema } from '@/lib/validations';

/**
 * PATCH /api/profile/education/[id]
 * Update an education entry
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = EducationSchema.partial().safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the education belongs to the user's profile
    const existingEducation = await db.education.findFirst({
      where: {
        id,
        profileId,
      },
    });

    if (!existingEducation) {
      return NextResponse.json({ error: 'Education not found' }, { status: 404 });
    }

    const education = await db.education.update({
      where: { id },
      data: {
        ...validatedData.data,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, education });
  } catch (error) {
    console.error('Error updating education:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/education/[id]
 * Delete an education entry
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

    const { profileId } = await resolveActiveProfileContext(userId);

    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Verify the education belongs to the user's profile
    const existingEducation = await db.education.findFirst({
      where: {
        id,
        profileId,
      },
    });

    if (!existingEducation) {
      return NextResponse.json({ error: 'Education not found' }, { status: 404 });
    }

    await db.education.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting education:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
