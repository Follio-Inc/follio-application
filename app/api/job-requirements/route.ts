import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { isAIAvailable } from '@/lib/ai-client';
import { AppError, ErrorCode, Errors, handleApiError } from '@/lib/errors';
import { RESUME_EDIT_LIMITS } from '@/lib/resume-edit/types';
import { readJobRequirements } from '@/services/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/job-requirements
 * What a pasted posting asks a candidate to have, with company, benefits,
 * and legal text left out. The AI edit panel scores the resume against it
 * on every change; the posting itself is read once and cached.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();

    const body: unknown = await request.json().catch(() => null);
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const jobDescription =
      typeof record.jobDescription === 'string' ? record.jobDescription.trim() : '';
    if (jobDescription.length < RESUME_EDIT_LIMITS.jobMinChars) {
      throw Errors.validation('Add a bit more of the job description.');
    }
    if (jobDescription.length > RESUME_EDIT_LIMITS.jobMaxChars) {
      throw Errors.validation(
        'That posting is too long. Paste the job description, not the whole page.'
      );
    }

    if (!isAIAvailable()) {
      throw new AppError(
        'Reading job requirements is unavailable right now.',
        ErrorCode.SERVICE_UNAVAILABLE,
        503
      );
    }

    const requirements = await readJobRequirements(jobDescription);
    if (!requirements) {
      throw new AppError(
        'Could not read this posting’s requirements. Try again in a moment.',
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        502
      );
    }
    return NextResponse.json({ requirements });
  } catch (error) {
    return handleApiError(error, { path: '/api/job-requirements', method: 'POST' });
  }
}
