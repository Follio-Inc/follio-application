/**
 * Request bodies for /api/resume-edits. Limits come from RESUME_EDIT_LIMITS,
 * so the panel, the API, and the model refuse the same input.
 */

import { z } from 'zod';

import { EDIT_PRESETS, explainBrief, RESUME_EDIT_LIMITS, type EditPresetId } from './types';

const presetIds = EDIT_PRESETS.map((preset) => preset.id) as [EditPresetId, ...EditPresetId[]];

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => value?.trim() || null);

export const resumeEditBriefSchema = z
  .object({
    jobDescription: optionalText(RESUME_EDIT_LIMITS.jobMaxChars),
    instructions: optionalText(RESUME_EDIT_LIMITS.instructionsMaxChars),
    presets: z
      .array(z.enum(presetIds))
      .max(presetIds.length)
      .default([])
      .transform((ids) => [...new Set(ids)]),
    scope: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('all') }),
        z.object({ kind: z.literal('summary') }),
        z.object({ kind: z.literal('experience'), experienceId: z.string().min(1).max(64) }),
      ])
      .default({ kind: 'all' }),
  })
  .superRefine((brief, ctx) => {
    const problem = explainBrief(brief);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

export const applyResumeEditsSchema = z.object({
  apply: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().max(RESUME_EDIT_LIMITS.summaryMaxChars),
      })
    )
    .max(RESUME_EDIT_LIMITS.maxChanges)
    .default([]),
  reject: z.array(z.string().min(1).max(64)).max(RESUME_EDIT_LIMITS.maxChanges).default([]),
});

export const revertResumeEditsSchema = z.object({
  changeIds: z.array(z.string().min(1).max(64)).max(RESUME_EDIT_LIMITS.maxChanges).nullish(),
});

/** The first readable message from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Check the request and try again.';
}
