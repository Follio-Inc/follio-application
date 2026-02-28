import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { EducationSchema } from '@/lib/validations';

/**
 * GET /api/profile/education
 * Get all education entries for the current user's profile
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

    const education = await db.education.findMany({
      where: { profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ education });
  } catch (error) {
    console.error('Error fetching education:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/profile/education
 * Create a new education entry
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = EducationSchema.safeParse(body);

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

    // Get the highest sortOrder to add new education at the end
    const lastEducation = await db.education.findFirst({
      where: { profileId },
      orderBy: { sortOrder: 'desc' },
    });

    const education = await db.education.create({
      data: {
        profileId,
        ...validatedData.data,
        sortOrder: (lastEducation?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ success: true, education }, { status: 201 });
  } catch (error) {
    console.error('Error creating education:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
