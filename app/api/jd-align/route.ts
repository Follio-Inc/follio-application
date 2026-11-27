import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { handleApiError } from '@/lib/errors';
import { alignResumeToJob } from '@/services/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/jd-align
 * Compare a resume to a job description. The response is grounded spans,
 * an exact keyword overlap, and a recruiter-style expert read.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { message: 'Paste a resume and a job description to compare them.' } },
        { status: 400 }
      );
    }

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const resumeText = typeof record.resumeText === 'string' ? record.resumeText : '';
    const jobDescription = typeof record.jobDescription === 'string' ? record.jobDescription : '';
    const result = await alignResumeToJob({ resumeText, jobDescription });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
