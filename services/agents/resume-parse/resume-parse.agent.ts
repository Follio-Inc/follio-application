/**
 * Resume Parse Agent
 *
 * Workflow agent: AI-extract structured resume data from plain text,
 * normalize it, optionally save to profile. PDF text extraction stays in
 * importResumeWithAI (I/O), then this agent owns the LLM step.
 */

import { runAgent } from '@/lib/agents';
import {
  normalizeAIData,
  parseResumeTextWithAI,
  saveAIResumeToProfile,
  type NormalizedResumeData,
  type ParsedResumeAI,
} from '@/services/import/resume-ai.service';

import type { AgentContext, AgentRunResult, WorkflowAgentDefinition } from '@/types/agents';

export interface ResumeParseAgentInput {
  /** Extracted resume plain text */
  text: string;
  userId: string;
  profileId?: string;
  saveToProfile?: boolean;
}

export interface ResumeParseAgentOutput {
  data: NormalizedResumeData;
  saved: boolean;
}

export const resumeParseAgent: WorkflowAgentDefinition<
  ResumeParseAgentInput,
  ResumeParseAgentOutput
> = {
  kind: 'workflow',
  id: 'resume-parse',
  version: 'agent-v1',
  steps: [
    {
      id: 'parse-resume-ai',
      description: 'Extract structured resume fields with AI',
      run: async (memory) => {
        const input = memory.get<ResumeParseAgentInput>('__input');
        if (!input?.text) throw new Error('Resume parse agent missing text input');
        const started = Date.now();
        const parsed = await parseResumeTextWithAI(input.text);
        memory.set('parsed', parsed);
        memory.set('parseStartedAt', started);
      },
    },
    {
      id: 'normalize-resume',
      description: 'Normalize AI output into import shape',
      run: async (memory) => {
        const parsed = memory.get<ParsedResumeAI>('parsed');
        const started = memory.get<number>('parseStartedAt') ?? Date.now();
        if (!parsed) throw new Error('Missing parsed resume');
        const data = normalizeAIData(parsed, Date.now() - started);
        memory.set('normalized', data);
      },
    },
    {
      id: 'optional-save',
      description: 'Optionally persist to profile',
      run: async (memory) => {
        const input = memory.get<ResumeParseAgentInput>('__input');
        const data = memory.get<NormalizedResumeData>('normalized');
        if (!input || !data) throw new Error('Missing resume data for save step');

        if (!input.saveToProfile) {
          memory.set('saved', false);
          return;
        }

        const result = await saveAIResumeToProfile(input.userId, data);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save resume to profile');
        }
        memory.set('saved', true);
      },
    },
  ],
  finalize: (memory) => {
    const data = memory.get<NormalizedResumeData>('normalized');
    if (!data) throw new Error('Resume parse finalize missing normalized data');
    return {
      data,
      saved: memory.get<boolean>('saved') ?? false,
    };
  },
};

export async function runResumeParseAgent(
  input: ResumeParseAgentInput,
  ctx: AgentContext = {}
): Promise<AgentRunResult<ResumeParseAgentOutput>> {
  return runAgent(resumeParseAgent, input, {
    ...ctx,
    userId: input.userId,
    profileId: input.profileId ?? ctx.profileId,
    budget: {
      maxSteps: 4,
      maxDurationMs: 90_000,
      ...ctx.budget,
    },
  });
}
