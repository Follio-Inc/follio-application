import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { SkillSchema } from '@/lib/validations';
import { z } from 'zod';

/**
 * GET /api/profile/skills
 * Get all skills and skill groups for the current user's profile
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

    const [skills, skillGroups] = await Promise.all([
      db.skill.findMany({
        where: { profileId },
        orderBy: { sortOrder: 'asc' },
      }),
      db.skillGroup.findMany({
        where: { profileId },
        include: { skills: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    return NextResponse.json({
      skills,
      skillGroups,
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Schema for creating skill with optional group
const CreateSkillSchema = SkillSchema.extend({
  groupId: z.string().optional().nullable(),
});

/**
 * POST /api/profile/skills
 * Create a new skill
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = CreateSkillSchema.safeParse(body);

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

    // Check for duplicate skill name
    const existingSkill = await db.skill.findFirst({
      where: {
        profileId,
        name: validatedData.data.name,
      },
    });

    if (existingSkill) {
      return NextResponse.json({ error: 'A skill with this name already exists' }, { status: 409 });
    }

    // Get the highest sortOrder
    const lastSkill = await db.skill.findFirst({
      where: { profileId },
      orderBy: { sortOrder: 'desc' },
    });

    const skill = await db.skill.create({
      data: {
        profileId,
        name: validatedData.data.name,
        level: validatedData.data.level,
        yearsOfExp: validatedData.data.yearsOfExp,
        groupId: validatedData.data.groupId,
        sortOrder: (lastSkill?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ success: true, skill }, { status: 201 });
  } catch (error) {
    console.error('Error creating skill:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
