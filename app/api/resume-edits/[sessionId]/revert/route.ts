import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { Errors, handleApiError } from '@/lib/errors';
import { firstIssue, revertResumeEditsSchema } from '@/lib/resume-edit/requests';
import { revertResumeEdits } from '@/services/resume-edit-session.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/resume-edits/[sessionId]/revert
 * Undo applied changes. Lines the user edited since are left as they are.
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
    const parsed = revertResumeEditsSchema.safeParse(body ?? {});
    if (!parsed.success) throw Errors.validation(firstIssue(parsed.error));

    const result = await revertResumeEdits(userId, sessionId, parsed.data.changeIds ?? null);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { path: '/api/resume-edits/[sessionId]/revert', method: 'POST' });
  }
}
