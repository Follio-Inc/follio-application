/**
 * GET /api/resumes/[resumeId]/rewrite-proposals/[batchId]/proposals/[proposalId]
 *
 * One suggestion's current status: the verification verdict the agent
 * reached, the decision the user has taken, the lifecycle state those two
 * produce, and whether the resume still reads the way the suggestion expects.
 *
 * Read-only. The proposal lookup scopes by user, resume and batch together,
 * so a proposal id guessed from another account — or a real id from one of
 * this user's other resumes — matches nothing.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { handleApiError } from '@/lib/errors';
import { loadProposal } from '@/services/resume-proposals.service';

import { authorizeResume } from '../../../authorize';

interface RouteContext {
  params: Promise<{ resumeId: string; batchId: string; proposalId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { resumeId, batchId, proposalId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;

    const proposal = await loadProposal(authorized.context.userId, resumeId, batchId, proposalId);
    return NextResponse.json({ proposal });
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}`,
      method: request.method,
    });
  }
}
