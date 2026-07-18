/**
 * Follio product agents.
 *
 * Domain agents live here; the shared runtime lives in lib/agents.
 * Add new agents as services/agents/<domain>/ and export them from this barrel.
 */

export {
  runPortfolioGenerationAgent,
  portfolioGenerationAgent,
  listAttachedSources,
  PORTFOLIO_SECTION_POLICIES,
} from './portfolio';

export type { PortfolioGenerationAgentInput, PortfolioGenerationAgentOutput } from './portfolio';

export { runSnapViewAgent, snapViewAgent, buildSnapViewUserPrompt } from './snap-view';

export { runResumeParseAgent, resumeParseAgent } from './resume-parse';
export type { ResumeParseAgentInput, ResumeParseAgentOutput } from './resume-parse';
