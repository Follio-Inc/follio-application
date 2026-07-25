import { EmailConflictError, getOrCreateUserForClerk } from '@/lib/account/resolve-user';
import { db } from '@/lib/db';
import { auth, currentUser } from '@clerk/nextjs/server';
import type { MainPurpose } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/onboarding/purpose
 * Save user's main purpose selection
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { purpose } = body;

    // Validate purpose
    const validPurposes = [
      'JOB_SEARCH',
      'PERSONAL_BRAND',
      'PROJECTS',
      'RESEARCH',
      'COMPANY',
      'OTHER',
    ];

    if (purpose && !validPurposes.includes(purpose)) {
      return NextResponse.json({ error: 'Invalid purpose value' }, { status: 400 });
    }

    const mainPurpose = (purpose || null) as MainPurpose | null;

    let user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      const clerkUser = await currentUser();
      // Use primaryEmailAddress to get the user's primary email (first signup email)
      const primaryEmailAddr = clerkUser?.primaryEmailAddress?.emailAddress;
      if (!primaryEmailAddr) {
        return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
      }

      const resolved = await getOrCreateUserForClerk({
        clerkId: userId,
        email: primaryEmailAddr,
        createData: { mainPurpose },
      });

      // Ensure purpose is set for both create and orphan-reclaim paths
      user = await db.user.update({
        where: { id: resolved.id },
        data: { mainPurpose },
      });
    } else {
      user = await db.user.update({
        where: { id: user.id },
        data: { mainPurpose },
      });
    }

    return NextResponse.json({
      success: true,
      purpose: user.mainPurpose,
    });
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
    console.error('Error saving purpose:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
