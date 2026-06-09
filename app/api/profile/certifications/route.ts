import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { CertificationSchema } from '@/lib/validations';

// GET /api/profile/certifications - Get all certifications
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

    const certifications = await db.certification.findMany({
      where: { profileId },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(certifications);
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

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const { name, issuer, credentialId, credentialUrl, issueDate, expirationDate } =
      CertificationSchema.parse(body);

    // Get max sortOrder
    const maxOrder = await db.certification.aggregate({
      where: { profileId },
      _max: { sortOrder: true },
    });

    const certification = await db.certification.create({
      data: {
        profileId,
        name,
        issuer,
        credentialId,
        credentialUrl,
        issueDate: issueDate ?? null,
        expirationDate: expirationDate ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });

    return NextResponse.json({ certification }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
