import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/profile/sections/[id] - Get a single section
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

    const section = await db.profileSection.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!section) {
      throw new AppError('Section not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json(section);
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/profile/sections/[id] - Update a single section
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
    const { title, isVisible, sortOrder, customContent, contentType } = body;

    const section = await db.profileSection.update({
      where: {
        id,
        profileId: user.profile.id,
      },
      data: {
        ...(title !== undefined && { title }),
        ...(isVisible !== undefined && { isVisible }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(customContent !== undefined && { customContent }),
        ...(contentType !== undefined && { contentType }),
      },
    });

    return NextResponse.json(section);
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/profile/sections/[id] - Delete a section
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

    // Find the section first to check its type
    const section = await db.profileSection.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!section) {
      throw new AppError('Section not found', ErrorCode.NOT_FOUND, 404);
    }

    // Don't allow deleting BASIC_INFO section
    if (section.type === 'BASIC_INFO') {
      throw new AppError('Cannot delete Basic Info section', ErrorCode.BAD_REQUEST, 400);
    }

    await db.profileSection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
