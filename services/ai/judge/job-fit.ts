/**
 * A recruiter's read of one resume against one job.
 * The model judges. parseExpertRead is what the screen trusts.
 */

import { z } from 'zod';

import { executeAICall } from '@/lib/ai-client';
import { logger } from '@/lib/logger';

import type { ExpertRead } from './types';

const log = logger.child({ source: 'judge-job-fit' });

const NOTE_ORDER = ['top of the resume', 'keywords', 'what else matters'];

export const JOB_FIT_SYSTEM_PROMPT = `You read a resume the way a recruiter does, against one job description.

A recruiter looks at the top first, then checks whether the posting's words are actually on the page, then decides if the scope and evidence fit. Judge only these two texts. Do not invent employers, titles, tools, metrics, or years. If a requirement is missing, say it is missing. A nearby skill is not a match: JavaScript is not Java, AWS is not GCP.

Return JSON:
{
  "score": number,
  "summary": string,
  "notes": [
    { "label": "Top of the resume", "note": string },
    { "label": "Keywords", "note": string },
    { "label": "What else matters", "note": string }
  ]
}

score is an integer from 0 to 100 for the overall match.
- 85 to 100: a recruiter would move this forward with little doubt.
- 65 to 84: a plausible fit, with a gap a recruiter would notice.
- 40 to 64: partial. The reader has to hunt, or a central requirement is missing.
- 0 to 39: the resume does not read as a fit for this posting.

summary is two sentences the candidate can read. Name the fit and the main gap. Use only facts written in the texts.

notes are exactly these three, in this order:
- Top of the resume: what the headline, summary, and most recent role tell a recruiter in a few seconds, and whether the target role is obvious there.
- Keywords: whether the posting's important tools and requirements are written plainly on the resume, the way an ATS and a skimming recruiter both look for them.
- What else matters: scope, evidence, seniority, or a specific gap that would change the decision.

Each note is one sentence. Do not give an advice list. Do not mention that you are a model.`;

const expertSchema = z.object({
  score: z.coerce.number(),
  summary: z.string(),
  notes: z
    .array(
      z.object({
        label: z.string(),
        note: z.string(),
      })
    )
    .optional(),
});

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Turn model JSON into a read the screen can show, or null when it is not usable. */
export function parseExpertRead(model: unknown): ExpertRead | null {
  const parsed = expertSchema.safeParse(model);
  if (!parsed.success || !Number.isFinite(parsed.data.score)) return null;

  let score = parsed.data.score;
  if (score > 0 && score < 1) score *= 100;
  score = Math.round(score);
  if (score < 0 || score > 100) return null;

  const summary = cleanLine(parsed.data.summary, 320);
  if (summary.length < 12) return null;

  const notes = (parsed.data.notes ?? [])
    .map((note, index) => ({
      label: cleanLine(note.label, 40),
      note: cleanLine(note.note, 220),
      index,
    }))
    .filter((note) => note.label.length > 0 && note.note.length > 0)
    .sort((a, b) => {
      const ai = NOTE_ORDER.indexOf(a.label.toLowerCase());
      const bi = NOTE_ORDER.indexOf(b.label.toLowerCase());
      const ar = ai === -1 ? NOTE_ORDER.length + a.index : ai;
      const br = bi === -1 ? NOTE_ORDER.length + b.index : bi;
      return ar - br;
    })
    .slice(0, 3)
    .map(({ label, note }) => ({ label, note }));

  return { score, summary, notes };
}

export function buildJobFitUserPrompt(resumeText: string, jobDescription: string): string {
  return `RESUME
"""
${resumeText.trim()}
"""

JOB DESCRIPTION
"""
${jobDescription.trim()}
"""`;
}

/** Holistic recruiter read. Returns null when the model is unavailable or unusable. */
export async function judgeJobFit(
  resumeText: string,
  jobDescription: string
): Promise<ExpertRead | null> {
  try {
    const result = await executeAICall<unknown>({
      stage: 'jdExpert',
      taskType: 'strategy',
      temperature: 0.2,
      systemPrompt: JOB_FIT_SYSTEM_PROMPT,
      userPrompt: buildJobFitUserPrompt(resumeText, jobDescription),
      jsonMode: true,
    });
    const expert = parseExpertRead(result.data);
    if (!expert) {
      log.warn('Expert read was discarded');
      return null;
    }
    log.info('Expert read ready', { score: expert.score, notes: expert.notes.length });
    return expert;
  } catch (error) {
    log.error('Expert read failed', error);
    return null;
  }
}
