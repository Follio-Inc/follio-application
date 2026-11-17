/**
 * Resume pinning for agent tools.
 *
 * Lives in its own module because both the agent definition and the tool
 * modules it registers need it. Importing it from resume.agent.ts would make
 * a cycle once editing tools join the agent's tool list.
 */

import { Errors } from '@/lib/errors';

import type { AgentTool, AgentToolContext } from '@/types/agents';

/**
 * Context key holding the resume the user selected. Set by runResumeAgent from
 * trusted input — never from a tool argument the model wrote.
 */
export const SELECTED_RESUME_META_KEY = 'selectedResumeId';

/** The resume this run is allowed to touch, or '' when none was pinned. */
export function selectedResumeId(ctx: AgentToolContext): string {
  return typeof ctx.meta?.[SELECTED_RESUME_META_KEY] === 'string'
    ? (ctx.meta[SELECTED_RESUME_META_KEY] as string).trim()
    : '';
}

/**
 * Constrain a resume-scoped tool to the selected resume.
 *
 * The model proposes `resumeId` like any other argument, so the prompt alone
 * cannot stop it naming a different one. This rejects the call instead of
 * quietly rewriting it, so a substitution attempt is visible in the run rather
 * than hidden behind a correct-looking answer.
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
          `This run analyzes only the resume the user selected (${selected}). ` +
            `Call ${tool.name} with resumeId="${selected}".`
        );
      }

      return tool.execute({ ...(input as object), resumeId: selected }, ctx);
    },
  };
}
