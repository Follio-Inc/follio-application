import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { CreateProfileSchema } from '@/lib/validations';

/**
 * POST /api/profile
 * Create a new profile for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = CreateProfileSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validatedData.error.flatten() },
        { status: 400 }
      );
    }

    const { handle, firstName, lastName, headline, summary, location } = validatedData.data;

    // Check if user exists
    const user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user already has a profile
    const existingProfile = await db.profile.findUnique({
      where: { userId: user.id },
    });

    if (existingProfile) {
      return NextResponse.json({ error: 'Profile already exists' }, { status: 409 });
    }

    // Check if handle is available
    const handleTaken = await db.profile.findUnique({
      where: { handle },
    });

    if (handleTaken) {
      return NextResponse.json({ error: 'Handle is already taken', message: 'Please choose a different handle' }, { status: 409 });
    }

    // Create profile
    const profile = await db.profile.create({
      data: {
        userId: user.id,
        handle,
        firstName,
        lastName,
        headline,
        summary,
        location,
        status: 'DRAFT',
      },
    });

    // Create empty contact info
    await db.contactInfo.create({
      data: {
        profileId: profile.id,
      },
    });

    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (error) {
    console.error('Error creating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/profile
 * Get the current user's profile
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
            contactInfo: true,
            links: { orderBy: { sortOrder: 'asc' } },
            workExperiences: { orderBy: { sortOrder: 'asc' } },
            educations: { orderBy: { sortOrder: 'asc' } },
            skills: { orderBy: { sortOrder: 'asc' } },
            skillGroups: { include: { skills: true }, orderBy: { sortOrder: 'asc' } },
            projects: { orderBy: { sortOrder: 'asc' } },
            awards: { orderBy: { sortOrder: 'asc' } },
            certifications: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ profile: user.profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * Update the current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Update profile
    const profile = await db.profile.update({
      where: { id: user.profile.id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        headline: body.headline,
        summary: body.summary,
        location: body.location,
        avatarUrl: body.avatarUrl,
        status: body.status,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
