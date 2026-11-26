/**
 * POST .../proposals/[proposalId]/apply
 *
 * The only endpoint in Follio that writes resume text on an agent's
 * suggestion, and it takes no input at all. The body schema is strict and
 * empty, so a client that tries to send replacement text — `proposedText`,
 * `text`, anything — gets a 400 rather than having it ignored. What is
 * written is the stored text the Verification Agent saw and the user
 * approved, read back from the database.
 *
 * Everything else is the service's job: it re-checks the verification
 * verdict, re-checks the human decision, resolves the target through the same
 * allow-list the agent was constrained by, and performs the write as a
 * compare-and-swap that only matches while the resume still reads the way the
 * user reviewed it.
 *
 * Failure cases return a structured conflict rather than a bare 409 message:
 * `details.state` tells the client whether the suggestion was already applied,
 * rejected, or has gone stale, so the interface can offer the right next step.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { handleApiError } from '@/lib/errors';
import { applyProposal } from '@/services/resume-proposals.service';

import { authorizeResume, readJsonBody } from '../../../../authorize';

/** Deliberately empty: this endpoint accepts no caller-supplied content. */
const applySchema = z.object({}).strict();

interface RouteContext {
  params: Promise<{ resumeId: string; batchId: string; proposalId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { resumeId, batchId, proposalId } = await context.params;

  try {
    const authorized = await authorizeResume(resumeId);
    if (!authorized.ok) return authorized.response;

    const raw = await readJsonBody(request);
    const parsed = applySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            'This endpoint takes no body. The text that gets applied is the verified text you ' +
            'already approved, not text sent with this request.',
        },
        { status: 400 }
      );
    }

    const proposal = await applyProposal(authorized.context.userId, resumeId, batchId, proposalId);

    return NextResponse.json({ proposal, applied: true });
  } catch (error) {
    return handleApiError(error, {
      path: `/api/resumes/${resumeId}/rewrite-proposals/${batchId}/proposals/${proposalId}/apply`,
      method: request.method,
    });
  }
}
