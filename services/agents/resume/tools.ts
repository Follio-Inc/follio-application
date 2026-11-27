/**
 * Tools for the Resume Agent.
 *
 * Read-only. Nothing in this module writes to the database.
 *
 * The resume shape returned here is produced by `toConnectorProfileView`, the
 * same builder the MCP/AI connector uses, so the agent, the connector and the
 * Follio UI all describe a resume the same way.
 *
 * Two security properties are enforced in code rather than in the prompt:
 *   - the authenticated user comes from `AgentContext`, never from a tool
 *     argument the model wrote;
 *   - the resume under analysis is pinned to the one the caller selected.
 */

import { z } from 'zod';

// Deep import on purpose: the `@/lib/agents` barrel re-exports `runAgent`,
// which pulls in the runtime. Tool modules only need the definition helper.
import { defineTool } from '@/lib/agents/define-tool';
import { toConnectorProfileView, type ConnectorProfileView } from '@/lib/ai-connector/profile-view';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

import type { AgentTool, AgentToolContext } from '@/types/agents';

// ============================================================================
// RESUME PINNING
// ============================================================================

/**
 * Context key holding the resume the caller selected. Set by `runResumeAgent`
 * from trusted input — never from a tool argument the model wrote.
 *
 * Lives here rather than in resume.agent.ts so the tool and the agent can both
 * reach it without a cycle. Move it to its own module once a second resume
 * tool module exists.
 */
export const SELECTED_RESUME_META_KEY = 'selectedResumeId';

/** The resume this run is allowed to read, or '' when none was pinned. */
export function selectedResumeId(ctx: AgentToolContext): string {
  const value = ctx.meta?.[SELECTED_RESUME_META_KEY];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Constrain a resume-scoped tool to the selected resume.
 *
 * The model proposes `resumeId` like any other argument, so the prompt alone
 * cannot stop it naming a different one. This rejects the call rather than
 * quietly rewriting it, so a substitution attempt shows up in the run instead
 * of hiding behind a correct-looking answer.
 *
 * This is defence in depth, not the primary control: `get_resume` also scopes
 * its own query by the authenticated user, so a mismatched id could only ever
 * reach another resume the same user already owns.
 */
export function pinnedToSelectedResume(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (input: unknown, ctx: AgentToolContext) => {
      const selected = selectedResumeId(ctx);
      if (!selected) {
        throw Errors.badRequest('No resume was selected for this run.');
      }

      const requested = (input as { resumeId?: unknown }).resumeId;
      if (typeof requested !== 'string' || requested.trim() !== selected) {
        throw Errors.badRequest(
          `This run reads only the resume the user selected (${selected}). ` +
            `Call ${tool.name} with resumeId="${selected}".`
        );
      }

      return tool.execute({ ...(input as object), resumeId: selected }, ctx);
    },
  };
}

// ============================================================================
// get_resume
// ============================================================================

/** Agent-memory key holding the most recently read resume. */
export const MEMORY_RESUME = 'resumeView';

/** The payload `get_resume` returns. */
export type AgentResumeView = ConnectorProfileView & { resumeId: string };

export const getResumeInputSchema = z.object({
  resumeId: z
    .string()
    .min(1)
    .describe('The id of the resume the user selected, exactly as given in the task.'),
});

export const getResumeTool = defineTool({
  name: 'get_resume',
  description:
    "Read the user's selected resume: name, headline, summary, location, contact details, work " +
    'experience, education, skills and projects. Read-only — it never changes the resume.',
  inputSchema: getResumeInputSchema,
  execute: async ({ resumeId }, ctx): Promise<AgentResumeView> => {
    // Fail closed. `AgentContext.userId` is optional (types/agents.ts), and an
    // undefined userId would reach Prisma as an omitted `where` filter — which
    // matches every profile in the database rather than none.
    const userId = ctx.userId?.trim();
    if (!userId) {
      throw Errors.unauthorized('No authenticated user in agent context; cannot read a resume.');
    }

    const targetId = resumeId.trim();
    if (!targetId) {
      throw Errors.badRequest('A resumeId is required.');
    }

    // Ownership is the `where` clause, not a check after the fact: a resume
    // belonging to another user cannot be selected in the first place.
    // A resume in Follio is a Profile row (prisma/schema.prisma, model Profile).
    const profile = await db.profile.findFirst({
      where: { id: targetId, userId, isArchived: false },
      include: {
        contactInfo: true,
        workExperiences: { orderBy: { sortOrder: 'asc' } },
        educations: { orderBy: { sortOrder: 'asc' } },
        skills: { orderBy: { sortOrder: 'asc' } },
        skillGroups: {
          include: { skills: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        projects: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // Not-found and not-yours are deliberately the same answer, so the agent
    // cannot be used to probe which resume ids exist.
    if (!profile) {
      throw Errors.notFound('Resume');
    }

    const view: AgentResumeView = {
      resumeId: profile.id,
      ...toConnectorProfileView(profile),
    };

    // Stored so the result tool can report facts read from the resume itself
    // rather than from the model's recollection of it.
    ctx.memory.set(MEMORY_RESUME, view);

    return view;
  },
});
