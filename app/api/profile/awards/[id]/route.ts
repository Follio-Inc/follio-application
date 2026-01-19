import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/profile/awards/[id] - Get a single award
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const award = await db.award.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!award) {
      throw new AppError('Award not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json({ award });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/profile/awards/[id] - Update an award
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const { title, issuer, date, description, url, sortOrder } = body;

    const award = await db.award.update({
      where: {
        id,
        profileId: user.profile.id,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(issuer !== undefined && { issuer }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(description !== undefined && { description }),
        ...(url !== undefined && { url }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json({ award });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/profile/awards/[id] - Delete an award
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { id } = await params;

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: true },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    await db.award.delete({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
