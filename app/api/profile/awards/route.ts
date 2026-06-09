import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { AwardSchema } from '@/lib/validations';

// GET /api/profile/awards - Get all awards
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const awards = await db.award.findMany({
      where: { profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(awards);
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

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const { title, issuer, date, description, url } = AwardSchema.parse(body);

    // Get max sortOrder
    const maxOrder = await db.award.aggregate({
      where: { profileId },
      _max: { sortOrder: true },
    });

    const award = await db.award.create({
      data: {
        profileId,
        title,
        issuer,
        date: date ?? null,
        description,
        url,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ award }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
