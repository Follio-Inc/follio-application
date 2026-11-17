/**
 * Tools for the Resume Agent.
 *
 * Read-only for now. These tools reuse the AI-connector read path so the agent,
 * the MCP connector and the Follio UI all return the same resume shape.
 *
 * Nothing here writes to the database.
 */

import { z } from 'zod';

// Imported from the deep path on purpose: the `@/lib/agents` barrel re-exports
// `runAgent`, which pulls in persist-run -> lib/db. Tool modules stay free of
// that chain so they can be unit-tested without the Prisma client.
import { defineTool } from '@/lib/agents/define-tool';
import { RESUME_ID_DESCRIPTION, ResumeRefSchema } from '@/lib/ai-connector/resume-target';
import { Errors } from '@/lib/errors';
import { getConnectorProfile } from '@/services/ai-connector.service';

/** Agent-memory key holding the most recently read resume. */
export const MEMORY_RESUME = 'resumeView';

/** The resume payload `get_resume` returns, as produced by the connector read path. */
export type AgentResumeView = Awaited<ReturnType<typeof getConnectorProfile>>;

export const getResumeInputSchema = z.object({
  resumeId: ResumeRefSchema.shape.resumeId.describe(RESUME_ID_DESCRIPTION),
});

export const getResumeTool = defineTool({
  name: 'get_resume',
  description:
    "Read one of the user's resumes: name, headline, summary, experience, education, skills and projects. " +
    'Read-only — it never changes the resume. Requires a resumeId the user named.',
  inputSchema: getResumeInputSchema,
  execute: async ({ resumeId }, ctx): Promise<AgentResumeView> => {
    // Fail closed. `AgentContext.userId` is optional (types/agents.ts), and an
    // undefined userId would reach Prisma as an omitted `where` filter — which
    // matches every profile in the database rather than none. Reject it here,
    // before any database-backed service is called.
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw Errors.unauthorized('No authenticated user in agent context; cannot read a resume.');
    }

    // getConnectorProfile enforces ownership via requireOwnedResume, which only
    // ever matches among resumes already filtered by this userId.
    const resume = await getConnectorProfile(userId, resumeId);

    ctx.memory.set(MEMORY_RESUME, resume);

    return resume;
  },
});
