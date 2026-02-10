import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { syncAvatarToClerk } from '@/lib/clerk-avatar-sync';
import { db } from '@/lib/db';
import { CreateProfileSchema } from '@/lib/validations';

/**
 * POST /api/profile
 * Create a new profile for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    console.log('[POST /api/profile] userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[POST /api/profile] Request body:', JSON.stringify(body));
    const validatedData = CreateProfileSchema.safeParse(body);

    if (!validatedData.success) {
      const flattenedErrors = validatedData.error.flatten();
      const fieldErrors = flattenedErrors.fieldErrors;
      // Get the first field error message for a user-friendly error
      const firstFieldError = Object.entries(fieldErrors)
        .map(([field, errors]) => `${field}: ${errors?.[0]}`)
        .filter(Boolean)[0];

      return NextResponse.json(
        {
          error: firstFieldError || 'Validation failed',
          details: flattenedErrors,
        },
        { status: 400 }
      );
    }

    const { handle, firstName, lastName, headline, summary, location } = validatedData.data;

    // Check if user exists, create if not (handles first-time profile creation)
    let user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      // Get user details from Clerk and create user in database
      const clerkUser = await currentUser();
      // Use primaryEmailAddress to get the user's primary email (first signup email)
      const primaryEmailAddr = clerkUser?.primaryEmailAddress?.emailAddress;
      if (!primaryEmailAddr) {
        return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
      }

      const email = primaryEmailAddr;

      // Check if a user with this email already exists
      const existingUserByEmail = await db.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        // SECURITY: Do NOT allow a new Clerk user to take over an existing account
        // This prevents account hijacking when someone connects an OAuth provider
        // that has the same email as an existing user's account.
        console.error(
          '[POST /api/profile] Email conflict detected:',
          email,
          'already belongs to user:',
          existingUserByEmail.id,
          'but Clerk user:',
          userId,
          'is trying to use it'
        );
        return NextResponse.json(
          {
            error: 'Email already in use',
            message:
              'This email is already associated with another account. Please sign in with your original account or use a different email.',
            code: 'EMAIL_CONFLICT',
          },
          { status: 409 }
        );
      }

      // Create new user - email is unique and not used by anyone else
      user = await db.user.create({
        data: {
          clerkId: userId,
          email,
        },
      });
      console.log('[POST /api/profile] Created new user:', email);
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
      return NextResponse.json(
        { error: 'Handle is already taken', message: 'Please choose a different handle' },
        { status: 409 }
      );
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
    console.error('[POST /api/profile] Error creating profile:', error);
    console.error('[POST /api/profile] Error stack:', error instanceof Error ? error.stack : 'N/A');
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

    // If handle is being updated, check availability first
    if (body.handle && body.handle !== user.profile.handle) {
      const handleTaken = await db.profile.findFirst({
        where: {
          handle: body.handle,
          id: { not: user.profile.id },
        },
        select: { id: true },
      });

      if (handleTaken) {
        return NextResponse.json(
          { error: 'Handle is already taken', message: 'Please choose a different handle' },
          { status: 409 }
        );
      }
    }

    // Update profile
    const profile = await db.profile.update({
      where: { id: user.profile.id },
      data: {
        ...(body.handle && { handle: body.handle }),
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

    // Sync avatar to Clerk if it was updated
    if (body.avatarUrl && body.avatarUrl !== user.profile.avatarUrl) {
      syncAvatarToClerk(userId, body.avatarUrl).catch((err) => {
        console.error('[PATCH /api/profile] Failed to sync avatar to Clerk:', err);
      });
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
