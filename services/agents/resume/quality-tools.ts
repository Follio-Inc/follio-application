/**
 * Resume quality tools for the Evaluation Agent.
 *
 * Read-only. Nothing here writes to the database, and nothing here calls an
 * LLM: every count, percentage and finding comes from the deterministic
 * analyser in lib/resume-quality. The model's job is to prioritise and phrase
 * what these return, not to produce them.
 *
 * Same two guards as the Phase 1 tools, for the same reasons: the resume must
 * already be in run memory (so a tool cannot quietly re-read a different one),
 * and the tool is wrapped with `pinnedToSelectedResume` by the agent, so it
 * can only ever reach the resume the caller selected.
 */

import { z } from 'zod';

import { defineTool } from '@/lib/agents/define-tool';
import { analyzeResumeQuality } from '@/lib/resume-quality/analyze';

import { MEMORY_RESUME, type AgentResumeView } from './tools';

import type { ResumeQualityReport } from '@/lib/resume-quality/types';
import type { AgentToolContext } from '@/types/agents';

/** Agent-memory key holding the computed quality report. */
export const MEMORY_QUALITY_REPORT = 'qualityReport';

/** How many findings the tool hands back to the model in one call. */
const MAX_FINDINGS_RETURNED = 25;

const resumeScopedInput = z.object({
  resumeId: z
    .string()
    .min(1)
    .describe('The id of the resume the user selected, exactly as given in the task.'),
});

function resumeFromMemory(ctx: AgentToolContext): AgentResumeView | undefined {
  return ctx.memory.get<AgentResumeView>(MEMORY_RESUME);
}

export const assessResumeQualityTool = defineTool({
  name: 'assess_resume_quality',
  description:
    'Analyse the writing quality of the selected resume: which sections are empty, how many ' +
    'bullets each role has, how many of them state a measurable result, which contain filler ' +
    'phrases, and which are too long or too short. Returns specific findings with the resume’s ' +
    'own text as evidence, most severe first. Deterministic — the counts come from Follio code, ' +
    'not from you.',
  inputSchema: resumeScopedInput,
  execute: async (_input, ctx) => {
    const resume = resumeFromMemory(ctx);
    if (!resume) {
      return {
        error: 'No resume in memory. Call get_resume first, then call this tool again.',
      };
    }

    // `AgentResumeView` is structurally assignable to `ResumeForQuality`.
    const report: ResumeQualityReport = analyzeResumeQuality(resume);

    // Stored whole so the result tool can report the computed figures rather
    // than whatever the model remembers of them.
    ctx.memory.set(MEMORY_QUALITY_REPORT, report);

    // The findings list can be long on a big resume; the model only needs
    // enough to prioritise, and the full report stays in memory for grounding.
    return {
      missingSections: report.missingSections,
      counts: report.counts,
      metricCoveragePercent: report.metricCoveragePercent,
      experiences: report.experiences.map((item) => ({
        location: item.location,
        bulletCount: item.bulletCount,
        quality: item.quality,
        bulletsWithMetrics: item.bulletsWithMetrics,
      })),
      projects: report.projects.map((item) => ({ title: item.title, quality: item.quality })),
      findings: report.findings.slice(0, MAX_FINDINGS_RETURNED),
      findingsTotal: report.findings.length,
      basis: report.basis,
    };
  },
});
