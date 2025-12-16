import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { SkillGroupSchema } from '@/lib/validations';

/**
 * GET /api/profile/skill-groups
 * Get all skill groups for the current user's profile
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
            skillGroups: {
              include: { skills: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ skillGroups: user.profile.skillGroups });
  } catch (error) {
    console.error('Error fetching skill groups:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/skill-groups
 * Create a new skill group
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = SkillGroupSchema.safeParse(body);

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

    // Check for duplicate group name
    const existingGroup = await db.skillGroup.findFirst({
      where: {
        profileId: user.profile.id,
        name: validatedData.data.name,
      },
    });

    if (existingGroup) {
      return NextResponse.json(
        { error: 'A skill group with this name already exists' },
        { status: 409 }
      );
    }

    // Get the highest sortOrder
    const lastGroup = await db.skillGroup.findFirst({
      where: { profileId: user.profile.id },
      orderBy: { sortOrder: 'desc' },
    });

    const skillGroup = await db.skillGroup.create({
      data: {
        profileId: user.profile.id,
        name: validatedData.data.name,
        sortOrder: (lastGroup?.sortOrder ?? -1) + 1,
      },
      include: { skills: true },
    });

    return NextResponse.json({ success: true, skillGroup }, { status: 201 });
  } catch (error) {
    console.error('Error creating skill group:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
