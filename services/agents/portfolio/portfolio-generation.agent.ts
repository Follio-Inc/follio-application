/**
 * Portfolio Generation Agent
 *
 * Tool-calling agent that adapts to whatever the user attached (resume,
 * GitHub, writing, LinkedIn, photos, …), applies per-section policies, and
 * produces TemplateCopy + owned content + enrichment.
 *
 * Public product APIs (onboarding, /api/portfolio/generate) should keep calling
 * `generateEnhancedPortfolio` — that service runs this agent under the hood
 * so the end-user experience stays seamless.
 */

import { z } from 'zod';

import { runAgent } from '@/lib/agents';
import { getDefaultCopy } from '@/services/portfolio/template-copy.service';
import { loadNormalizedProfile } from '@/services/portfolio/plan-helpers';
import { PORTFOLIO_AGENT_TOOLS } from '@/services/agents/portfolio/tools';

import type { AgentContext, AgentRunResult, ToolAgentDefinition } from '@/types/agents';
import type {
  TemplateAIEnrichment,
  TemplateCopy,
  TemplateProfileData,
} from '@/lib/portfolio/templates/types';

const portfolioResultSchema = z.object({
  copy: z.custom<TemplateCopy>(),
  enrichment: z.custom<TemplateAIEnrichment>(),
  content: z.custom<TemplateProfileData>(),
  stagesRun: z.array(z.string()),
  tokensUsed: z.object({
    input: z.number(),
    output: z.number(),
  }),
  summary: z.string().optional(),
});

export type PortfolioGenerationAgentOutput = z.infer<typeof portfolioResultSchema>;

export interface PortfolioGenerationAgentInput {
  profileId: string;
  /** Optional free-text guidance (e.g. regenerate focus). */
  focusNotes?: string;
}

const INSTRUCTIONS = `You are Follio's portfolio generation agent.

GOAL
Produce grounded portfolio narrative copy and portfolio-owned structural content from whatever the user has attached. Prefer writing section-by-section with policies.

HARD RULES
1. Only use attached sources. Call list_attached_sources first.
2. If writing is not attached, skip write_portfolio_section("writing") — narrative must stay null.
3. If GitHub is not attached, skip write_portfolio_section("github").
4. Follow section policies (experience ≠ projects ≠ writing).
5. Never invent employers, titles, degrees, or numbers.
6. Finish with assemble_from_sections then submit_portfolio_result.
7. synthesize_portfolio is a one-shot fallback only if section writing fails — prefer the section loop.

RECOMMENDED FLOW
1. list_attached_sources
2. load_profile_context
3. assess_content_quality
4. analyze_profile
5. write_portfolio_section for each needed section (contact → experience → projects → writing? → github? → about → hero)
6. assemble_from_sections
7. submit_portfolio_result

Be efficient — do not rewrite the same section twice.`;

export const portfolioGenerationAgent: ToolAgentDefinition<
  PortfolioGenerationAgentInput,
  PortfolioGenerationAgentOutput
> = {
  kind: 'tool',
  id: 'portfolio-generation',
  version: 'agent-v2',
  taskType: 'strategy',
  instructions: INSTRUCTIONS,
  buildUserMessage: (input) =>
    [
      `Generate a portfolio for profileId=${input.profileId}.`,
      input.focusNotes ? `Focus notes: ${input.focusNotes}` : null,
      'Write section-by-section, then assemble and submit.',
    ]
      .filter(Boolean)
      .join('\n'),
  tools: PORTFOLIO_AGENT_TOOLS,
  resultToolName: 'submit_portfolio_result',
  outputSchema: portfolioResultSchema,
  fallback: async (input) => {
    const normalized = await loadNormalizedProfile(input.profileId);
    if (!normalized) {
      throw new Error(`Profile not found: ${input.profileId}`);
    }
    const copy = getDefaultCopy(normalized);
    return {
      copy,
      enrichment: {
        archetype: 'operator',
        secondaryArchetypes: [],
        careerStage: 'mid-career',
        definingThemes: [],
        uniqueAngles: [],
        domains: [],
        mustFeature: [],
        weakItems: [],
        highlightFacts: [],
        stats: [],
        dataRichness: 0,
        validationScore: 0,
        _meta: {
          pipelineVersion: 'agent-v2-fallback',
          generatedAt: new Date().toISOString(),
          totalDurationMs: 0,
          totalTokensUsed: { input: 0, output: 0 },
          stagesRun: ['fallback'],
        },
      },
      content: normalized,
      stagesRun: ['fallback'],
      tokensUsed: { input: 0, output: 0 },
      summary: 'Fallback default copy (AI unavailable or agent failed)',
    };
  },
};

/**
 * Run the portfolio generation agent.
 * Prefer this from services; HTTP routes should keep using generateEnhancedPortfolio.
 */
export async function runPortfolioGenerationAgent(
  input: PortfolioGenerationAgentInput,
  ctx: AgentContext = {}
): Promise<AgentRunResult<PortfolioGenerationAgentOutput>> {
  return runAgent(portfolioGenerationAgent, input, {
    ...ctx,
    profileId: input.profileId,
    budget: {
      maxSteps: 18,
      maxDurationMs: 240_000,
      ...ctx.budget,
    },
  });
}
