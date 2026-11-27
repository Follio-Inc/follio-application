import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { isAIAvailable } from '@/lib/ai-client';
import { AppError, ErrorCode, Errors, handleApiError } from '@/lib/errors';
import { judgeJobFit } from '@/services/ai';
import { explainAlignInput } from '@/services/ai/jd-align/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/job-fit
 * A recruiter's read of a resume against one job: a 0–100 score, a short
 * summary, and three notes. The AI edit panel asks for it on purpose, not on
 * every change, because it is a model call.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();

    const body: unknown = await request.json().catch(() => null);
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const resumeText = typeof record.resumeText === 'string' ? record.resumeText : '';
    const jobDescription = typeof record.jobDescription === 'string' ? record.jobDescription : '';
    const problem = explainAlignInput(resumeText, jobDescription);
    if (problem) throw Errors.validation(problem);

    if (!isAIAvailable()) {
      throw new AppError(
        'The recruiter read is unavailable right now.',
        ErrorCode.SERVICE_UNAVAILABLE,
        503
      );
    }

    const read = await judgeJobFit(resumeText, jobDescription);
    if (!read) {
      throw new AppError(
        'The recruiter read did not come back. Try again in a moment.',
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        502
      );
    }
    return NextResponse.json({ read });
  } catch (error) {
    return handleApiError(error, { path: '/api/job-fit', method: 'POST' });
  }
}
