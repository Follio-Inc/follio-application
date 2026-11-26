/**
 * GET /api/resumes/[resumeId]/rewrite-proposals/[batchId]
 *
 * One stored batch with every proposal in it. Read-only: this endpoint writes
 * nothing, not to the resume and not to the proposals, including when it
 * notices that a target has drifted. Staleness is computed and reported, not
 * recorded — a user opening a page should not change their own data.
 *
 * Ownership is enforced by `authorizeResume` and again by the service's
 * `where` clause, which scopes the batch to this user *and* this resume. A
 * batch id belonging to someone else matches nothing and returns the same 404
 * as one that never existed.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { handleApiError } from '@/lib/errors';
import { loadBatch } from '@/services/resume-proposals.service';

import { authorizeResume } from '../authorize';

interface RouteContext {
  params: Promise<{ resumeId: string; batchId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { resumeId, batchId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;

    const result = await loadBatch(authorized.context.userId, resumeId, batchId);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals/${batchId}`,
      method: request.method,
    });
  }
}
