import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

// GET /api/profile/awards - Get all awards
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        profile: {
          include: {
            awards: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json(user.profile.awards);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/profile/awards - Create a new award
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const { title, issuer, date, description, url } = body;

    if (!title) {
      throw new AppError('Title is required', ErrorCode.VALIDATION_ERROR, 400);
    }

    // Get max sortOrder
    const maxOrder = await db.award.aggregate({
      where: { profileId: user.profile.id },
      _max: { sortOrder: true },
    });

    const award = await db.award.create({
      data: {
        profileId: user.profile.id,
        title,
        issuer,
        date: date ? new Date(date) : null,
        description,
        url,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ award }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
