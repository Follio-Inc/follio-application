/**
 * POST .../proposals/[proposalId]/decision   { "decision": "approve" | "reject" }
 *
 * Records what the user decided. Writes to the proposal row only — no resume
 * data is touched by this endpoint under any input, which is why approving is
 * separate from applying: deciding is cheap and reversible, and the single
 * irreversible operation has to be asked for by name.
 *
 * The body schema is strict and holds exactly one field. There is nothing a
 * client can send here that influences the verification verdict, the stored
 * replacement text, or which resume element the suggestion addresses.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { handleApiError } from '@/lib/errors';
import { decideProposal } from '@/services/resume-proposals.service';

import { authorizeResume, readJsonBody } from '../../../../authorize';

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict();

interface RouteContext {
  params: Promise<{ resumeId: string; batchId: string; proposalId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { resumeId, batchId, proposalId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;

    const raw = await readJsonBody(request);
    const parsed = decisionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Send { "decision": "approve" } or { "decision": "reject" }.' },
        { status: 400 }
      );
    }

    const proposal = await decideProposal(
      authorized.context.userId,
      resumeId,
      batchId,
      proposalId,
      parsed.data.decision
    );

    return NextResponse.json({ proposal });
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}/decision`,
      method: request.method,
    });
  }
}
