import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { SkillGroupSchema } from '@/lib/validations';

/**
 * PATCH /api/profile/skill-groups/[id]
 * Update a skill group
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = SkillGroupSchema.partial().safeParse(body);

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

    // Verify the skill group belongs to the user's profile
    const existingGroup = await db.skillGroup.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingGroup) {
      return NextResponse.json({ error: 'Skill group not found' }, { status: 404 });
    }

    const skillGroup = await db.skillGroup.update({
      where: { id },
      data: {
        ...validatedData.data,
        updatedAt: new Date(),
      },
      include: { skills: true },
    });

    return NextResponse.json({ success: true, skillGroup });
  } catch (error) {
    console.error('Error updating skill group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/skill-groups/[id]
 * Delete a skill group (skills in this group become ungrouped)
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

    // Verify the skill group belongs to the user's profile
    const existingGroup = await db.skillGroup.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!existingGroup) {
      return NextResponse.json({ error: 'Skill group not found' }, { status: 404 });
    }

    // Move skills from this group to ungrouped (set groupId to null)
    await db.skill.updateMany({
      where: { groupId: id },
      data: { groupId: null },
    });

    // Delete the group
    await db.skillGroup.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting skill group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
