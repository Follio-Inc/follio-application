import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { EmailConflictError, getOrCreateUserForClerk } from '@/lib/account/resolve-user';
import {
  resolveActiveProfileContext,
  resolveActiveProfileContextOrNull,
} from '@/lib/active-profile';
import { syncAvatarToClerk } from '@/lib/clerk-avatar-sync';
import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';
import { getVanityUsernameForUser, setExclusiveResumeVisibility } from '@/lib/public-resume';
import { generateUniqueResumeTitle } from '@/lib/resume-title';
import { CreateProfileSchema } from '@/lib/validations';

async function ensureActiveProfileForUser(clerkId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      profile: { select: { id: true } },
    },
  });

  if (!user) return;

  if (user.profile) return;

  const firstOwnedProfile = await db.profile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!firstOwnedProfile) return;

  await db.user.update({
    where: { id: user.id },
    data: {
      profile: {
        connect: { id: firstOwnedProfile.id },
      },
    },
  });
}

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

    const { handle, firstName, middleName, lastName, headline, summary, location } =
      validatedData.data;

    // Check if user exists, create if not (handles first-time profile creation).
    // Reclaims orphaned rows when a prior Clerk account for this email was deleted.
    let user;
    try {
      const existing = await db.user.findUnique({
        where: { clerkId: userId },
      });

      if (existing) {
        user = existing;
      } else {
        const clerkUser = await currentUser();
        const primaryEmailAddr = clerkUser?.primaryEmailAddress?.emailAddress;
        if (!primaryEmailAddr) {
          return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
        }

        user = await getOrCreateUserForClerk({
          clerkId: userId,
          email: primaryEmailAddr,
        });
        console.log('[POST /api/profile] Resolved user:', user.email);
      }
    } catch (error) {
      if (error instanceof EmailConflictError) {
        return NextResponse.json(
          {
            error: 'Email already in use',
            message: error.message,
            code: 'EMAIL_CONFLICT',
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // Check if user already has a profile
    const existingProfile = await db.profile.findFirst({
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

    // Get Clerk user to get their avatar (from Google OAuth, etc.)
    const clerkUser = await currentUser();
    const clerkAvatarUrl = clerkUser?.imageUrl || null;

    // Create profile - use Clerk avatar as initial value if available
    const resumeTitle = await generateUniqueResumeTitle(db, user.id);
    const profile = await db.profile.create({
      data: {
        userId: user.id,
        handle,
        resumeTitle,
        firstName,
        middleName,
        lastName,
        headline,
        summary,
        location,
        avatarUrl: clerkAvatarUrl,
        avatarUrlSource: clerkAvatarUrl ? 'MANUAL' : 'MANUAL',
        status: 'DRAFT',
      },
    });

    // Create empty contact info
    await db.contactInfo.create({
      data: {
        profileId: profile.id,
      },
    });

    // This is the user's first profile (a 409 is returned above otherwise), so
    // designate it as the stable portfolio (primary) profile.
    await db.user.update({
      where: { id: user.id },
      data: {
        primaryProfile: {
          connect: { id: profile.id },
        },
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

    await ensureActiveProfileForUser(userId);
    const context = await resolveActiveProfileContextOrNull(userId);

    if (!context?.profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = await db.profile.findUnique({
      where: { id: context.profileId },
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
        photos: { orderBy: { sortOrder: 'asc' } },
        blogPosts: { orderBy: { createdAt: 'desc' } },
        youtubeVideos: { orderBy: { createdAt: 'desc' } },
        sections: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return handleApiError(error, { path: '/api/profile', method: 'GET' });
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

    const context = await resolveActiveProfileContext(userId).catch(() => null);
    if (!context?.profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const existingProfile = await db.profile.findUnique({
      where: { id: context.profileId },
      select: { id: true, handle: true, avatarUrl: true },
    });

    if (!existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // If handle is being updated, check availability first
    if (body.handle && body.handle !== existingProfile.handle) {
      const handleTaken = await db.profile.findFirst({
        where: {
          handle: body.handle,
          id: { not: existingProfile.id },
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

    const shouldSyncAvatarToClerk = body.syncAvatarToClerk !== false;

    // Only one resume may be PUBLIC per user. Setting PUBLIC demotes any
    // other public resume to UNLISTED.
    let replacedPublicResume: Awaited<
      ReturnType<typeof setExclusiveResumeVisibility>
    >['replacedPublicResume'] = null;

    if (
      body.resumeVisibility === 'PUBLIC' ||
      body.resumeVisibility === 'UNLISTED' ||
      body.resumeVisibility === 'PRIVATE'
    ) {
      const result = await setExclusiveResumeVisibility(existingProfile.id, body.resumeVisibility);
      replacedPublicResume = result.replacedPublicResume;
    }

    // Update profile
    const profile = await db.profile.update({
      where: { id: existingProfile.id },
      data: {
        ...(body.handle && { handle: body.handle }),
        firstName: body.firstName,
        middleName: body.middleName,
        lastName: body.lastName,
        headline: body.headline,
        summary: body.summary,
        location: body.location,
        avatarUrl: body.avatarUrl,
        status: body.status,
        ...(body.portfolioVisibility && { portfolioVisibility: body.portfolioVisibility }),
        ...(body.linksVisibility && { linksVisibility: body.linksVisibility }),
        ...(typeof body.resumeShowPhoto === 'boolean' && { resumeShowPhoto: body.resumeShowPhoto }),
        updatedAt: new Date(),
      },
    });

    // Sync avatar to Clerk if it was updated and caller has not opted out.
    // Skip sync for:
    // - Clerk URLs — already on Clerk's CDN, re-syncing would invalidate the stored URL
    // - Local serving URLs (/api/photos/) — not downloadable by Clerk's server
    const isClerkUrl = body.avatarUrl?.includes('img.clerk.com');
    const isLocalPhotoUrl = body.avatarUrl?.startsWith('/api/photos/');
    if (
      shouldSyncAvatarToClerk &&
      body.avatarUrl &&
      body.avatarUrl !== existingProfile.avatarUrl &&
      !isClerkUrl &&
      !isLocalPhotoUrl
    ) {
      syncAvatarToClerk(userId, body.avatarUrl).catch((err) => {
        console.error('[PATCH /api/profile] Failed to sync avatar to Clerk:', err);
      });
    }

    const vanityUsername = await getVanityUsernameForUser(context.userId);

    return NextResponse.json({
      success: true,
      profile,
      vanityUsername,
      replacedPublicResume,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
