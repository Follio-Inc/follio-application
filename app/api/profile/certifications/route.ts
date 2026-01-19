import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';

// GET /api/profile/certifications - Get all certifications
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
            certifications: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    return NextResponse.json(user.profile.certifications);
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/profile/certifications - Create a new certification
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
    const { name, issuer, credentialId, credentialUrl, issueDate, expirationDate } = body;

    if (!name || !issuer) {
      throw new AppError('Name and issuer are required', ErrorCode.VALIDATION_ERROR, 400);
    }

    // Get max sortOrder
    const maxOrder = await db.certification.aggregate({
      where: { profileId: user.profile.id },
      _max: { sortOrder: true },
    });

    const certification = await db.certification.create({
      data: {
        profileId: user.profile.id,
        name,
        issuer,
        credentialId,
        credentialUrl,
        issueDate: issueDate ? new Date(issueDate) : null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ certification }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
