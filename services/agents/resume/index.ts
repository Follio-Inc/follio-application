/**
 * Resume Agent — a read-only tool-calling agent and the tools it runs on.
 * The tools are reusable on their own; the agent composes them.
 */

import { getResumeTool } from './tools';
import { analyzeJobDescriptionTool, scoreResumeAgainstJdTool } from './jd-tools';

export { getResumeTool, getResumeInputSchema, MEMORY_RESUME } from './tools';
export type { AgentResumeView } from './tools';

export {
  analyzeJobDescriptionTool,
  scoreResumeAgainstJdTool,
  analyzeJobDescriptionInputSchema,
  scoreResumeAgainstJdInputSchema,
  JD_AGENT_TOOLS,
  MEMORY_JOB_DESCRIPTION,
  MEMORY_JOB_REQUIREMENTS,
  MEMORY_EVALUATION,
  MEMORY_SCORED_RESUME_ID,
} from './jd-tools';

export {
  resumeAgent,
  runResumeAgent,
  submitResumeResultTool,
  resumeAgentResultSchema,
  RESUME_AGENT_BUDGET,
  SELECTED_RESUME_META_KEY,
} from './resume.agent';
export type { ResumeAgentInput, ResumeAgentOutput, ResumeAgentAuth } from './resume.agent';

/** Every read-only tool the Resume Agent can call today. */
export const RESUME_AGENT_TOOLS = [
  getResumeTool,
  analyzeJobDescriptionTool,
  scoreResumeAgainstJdTool,
];
