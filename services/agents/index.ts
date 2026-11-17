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

export {
  getResumeTool,
  getResumeInputSchema,
  analyzeJobDescriptionTool,
  scoreResumeAgainstJdTool,
  analyzeJobDescriptionInputSchema,
  scoreResumeAgainstJdInputSchema,
  RESUME_AGENT_TOOLS,
  JD_AGENT_TOOLS,
  MEMORY_RESUME,
  MEMORY_JOB_DESCRIPTION,
  MEMORY_JOB_REQUIREMENTS,
  MEMORY_EVALUATION,
  MEMORY_SCORED_RESUME_ID,
  resumeAgent,
  resumeProposeAgent,
  buildResumeAgent,
  RESUME_AGENT_MODES,
  MEMORY_PROPOSAL,
  MEMORY_PROPOSAL_ERROR,
  runResumeAgent,
  submitResumeResultTool,
  resumeAgentResultSchema,
  RESUME_AGENT_BUDGET,
  RESUME_PROPOSE_BUDGET,
  SELECTED_RESUME_META_KEY,
  readResumeLinesTool,
  readResumeLinesInputSchema,
  proposeResumeEditsTool,
  proposeResumeEditsInputSchema,
  RESUME_EDIT_AGENT_TOOLS,
  MEMORY_RESUME_LINES,
  MEMORY_RESUME_LINES_ID,
  AGENT_VIA,
  pinnedToSelectedResume,
  selectedResumeId,
} from './resume';
export type {
  AgentResumeView,
  ResumeAgentInput,
  ResumeAgentOutput,
  ResumeAgentAuth,
  ResumeLinesView,
  ProposeResumeEditsResult,
  ResumeAgentMode,
} from './resume';
