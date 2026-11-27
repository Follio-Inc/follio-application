import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { Errors, handleApiError } from '@/lib/errors';
import { firstIssue, resumeEditBriefSchema } from '@/lib/resume-edit/requests';
import {
  createResumeEditSession,
  listResumeEditSessions,
} from '@/services/resume-edit-session.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/resume-edits
 * Recent AI edit sessions for the resume open in the builder.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();
    const sessions = await listResumeEditSessions(userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    return handleApiError(error, { path: '/api/resume-edits', method: 'GET' });
  }
}

/**
 * POST /api/resume-edits
 * Propose edits for the active resume. Nothing is written to the resume.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();

    const body: unknown = await request.json().catch(() => null);
    const parsed = resumeEditBriefSchema.safeParse(body ?? {});
    if (!parsed.success) throw Errors.validation(firstIssue(parsed.error));

    const session = await createResumeEditSession(userId, parsed.data);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { path: '/api/resume-edits', method: 'POST' });
  }
}
