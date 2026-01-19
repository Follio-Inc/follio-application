import { db } from '@/lib/db';
import { auth, currentUser } from '@clerk/nextjs/server';
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

    // Get or create user
    let user = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      const clerkUser = await currentUser();
      if (!clerkUser?.emailAddresses?.[0]?.emailAddress) {
        return NextResponse.json({ error: 'Unable to get user details' }, { status: 400 });
      }

      user = await db.user.create({
        data: {
          clerkId: userId,
          email: clerkUser.emailAddresses[0].emailAddress,
          mainPurpose: purpose || null,
        },
      });
    } else {
      // Update existing user
      user = await db.user.update({
        where: { id: user.id },
        data: {
          mainPurpose: purpose || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      purpose: user.mainPurpose,
    });
  } catch (error) {
    console.error('Error saving purpose:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
