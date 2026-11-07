/**
 * Read a resume's skills with a model. Runs after a save, never while the
 * user waits; the builder uses the result the next time it loads it.
 */

import { createHash } from 'node:crypto';

import { executeAICall } from '@/lib/ai-client';
import type { SkillLine, StoredSkillProfile } from '@/services/ai/skills/types';

import { parseResumeSkills } from './parse';
import { buildResumeSkillsSystemPrompt, buildResumeSkillsUserPrompt } from './prompt';

/** Changes when any line's ref or text changes. */
export function hashSkillLines(lines: readonly SkillLine[]): string {
  const text = lines.map((line) => `${line.ref}\u0000${line.text}`).join('\u0001');
  return createHash('sha256').update(text).digest('hex');
}

/** The model's read of these lines. Throws when the call fails; null when the output is unusable. */
export async function readResumeSkillsWithModel(
  lines: readonly SkillLine[]
): Promise<StoredSkillProfile | null> {
  const result = await executeAICall<unknown>({
    stage: 'resumeSkills',
    taskType: 'extraction',
    temperature: 0,
    systemPrompt: buildResumeSkillsSystemPrompt(),
    userPrompt: buildResumeSkillsUserPrompt(lines),
    jsonMode: true,
  });
  return parseResumeSkills(result.data, lines, hashSkillLines(lines));
}
