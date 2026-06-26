/**
 * POST /api/portfolio/upload-image
 *
 * Stores an image for use in the portfolio editor (avatar or project image).
 * The client sends a base64 data URL; we persist it as a ProfilePhoto on the
 * user's PRIMARY profile (matching the portfolio surface) and return a stable
 * serving URL (`/api/photos/{id}`) to reference from the portfolio draft.
 *
 * No cloud storage is used — this mirrors the existing photo pipeline.
 *
 * Request body:
 *   dataUrl: string  — a `data:image/...;base64,...` string
 *   category?: 'avatar' | 'project'  — used only for the photo caption/grouping
 */

import { resolvePrimaryProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

// Guard against oversized payloads. ~7M base64 chars ≈ 5MB binary.
const MAX_DATA_URL_LENGTH = 7_000_000;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const { profileId } = await resolvePrimaryProfileContext(userId);

    const body = await request.json();
    const dataUrl = body?.dataUrl;

    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new AppError('Image data is required', ErrorCode.VALIDATION_ERROR, 400);
    }

    if (!/^data:image\/(png|jpe?g|webp|gif|avif);base64,/.test(dataUrl)) {
      throw new AppError('Unsupported image format', ErrorCode.VALIDATION_ERROR, 400);
    }

    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new AppError(
        'Image is too large. Please use an image under 5MB.',
        ErrorCode.VALIDATION_ERROR,
        400
      );
    }

    const caption = body?.category === 'avatar' ? 'Portfolio avatar' : 'Portfolio image';

    const lastPhoto = await db.profilePhoto.findFirst({
      where: { profileId, category: 'GALLERY' },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const photo = await db.profilePhoto.create({
      data: {
        profileId,
        url: dataUrl,
        caption,
        category: 'GALLERY',
        source: 'MANUAL',
        sortOrder: (lastPhoto?.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, url: `/api/photos/${photo.id}` }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { method: 'POST', path: '/api/portfolio/upload-image' });
  }
}
