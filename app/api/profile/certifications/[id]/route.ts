import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/profile/certifications/[id] - Get a single certification
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

    const certification = await db.certification.findFirst({
      where: {
        id,
        profileId: user.profile.id,
      },
    });

    if (!certification) {
      throw new AppError('Certification not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json({ certification });
  } catch (error) {
    return handleApiError(error);
  }
}

// PATCH /api/profile/certifications/[id] - Update a certification
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
    const { name, issuer, credentialId, credentialUrl, issueDate, expirationDate, sortOrder } =
      body;

    const certification = await db.certification.update({
      where: {
        id,
        profileId: user.profile.id,
      },
      data: {
        ...(name !== undefined && { name }),
        ...(issuer !== undefined && { issuer }),
        ...(credentialId !== undefined && { credentialId }),
        ...(credentialUrl !== undefined && { credentialUrl }),
        ...(issueDate !== undefined && { issueDate: issueDate ? new Date(issueDate) : null }),
        ...(expirationDate !== undefined && {
          expirationDate: expirationDate ? new Date(expirationDate) : null,
        }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json({ certification });
  } catch (error) {
    return handleApiError(error);
  }
}

// DELETE /api/profile/certifications/[id] - Delete a certification
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

    await db.certification.delete({
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
