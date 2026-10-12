import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { Errors, handleApiError } from '@/lib/errors';
import { applyResumeEditsSchema, firstIssue } from '@/lib/resume-edit/requests';
import { applyResumeEdits } from '@/services/resume-edit-session.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/resume-edits/[sessionId]/apply
 * Write the chosen changes to the active resume, and record rejections.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();

    const { sessionId } = await params;
    const body: unknown = await request.json().catch(() => null);
    const parsed = applyResumeEditsSchema.safeParse(body ?? {});
    if (!parsed.success) throw Errors.validation(firstIssue(parsed.error));

    const result = await applyResumeEdits(userId, sessionId, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { path: '/api/resume-edits/[sessionId]/apply', method: 'POST' });
  }
}
