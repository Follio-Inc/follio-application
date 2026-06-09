import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { normalizeCurrentDates, ProjectSchema } from '@/lib/validations';

/**
 * PATCH /api/profile/projects/[id]
 * Update a project
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = ProjectSchema.partial().safeParse(body);

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

    // Verify the project belongs to the user's profile
    const existingProject = await db.project.findFirst({
      where: {
        id,
        profileId,
      },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...normalizeCurrentDates(validatedData.data),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/projects/[id]
 * Delete a project
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

    // Verify the project belongs to the user's profile
    const existingProject = await db.project.findFirst({
      where: {
        id,
        profileId,
      },
    });

    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await db.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
