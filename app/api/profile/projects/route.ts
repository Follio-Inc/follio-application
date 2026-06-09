import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { normalizeCurrentDates, ProjectSchema } from '@/lib/validations';

/**
 * GET /api/profile/projects
 * Get all projects for the current user's profile
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

    const projects = await db.project.findMany({
      where: { profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/projects
 * Create a new project
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = ProjectSchema.safeParse(body);

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

    // Get the highest sortOrder
    const lastProject = await db.project.findFirst({
      where: { profileId },
      orderBy: { sortOrder: 'desc' },
    });

    const project = await db.project.create({
      data: {
        profileId,
        ...normalizeCurrentDates(validatedData.data),
        sortOrder: (lastProject?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ success: true, project }, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
