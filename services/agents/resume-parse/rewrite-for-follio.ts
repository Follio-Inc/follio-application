/**
 * Rewrite parsed resume copy into Follio voice before it is saved.
 *
 * The résumé keeps the full extract (experiences, skills, dates). This step
 * only rewrites the shared headline and about — the lines a stranger reads
 * after a QR scan. Role peeks are condensed later in `buildFollioIdentity`.
 *
 * Falls back to the deterministic Follio voice if AI is unavailable or fails.
 * Never throws: import should still succeed with the extracted résumé.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { rewriteAbout, rewriteHeadline } from '@/lib/follio-identity';
import { logger } from '@/lib/logger';
import type { NormalizedResumeData } from '@/services/import/resume-ai.service';

const rewriteLogger = logger.child({ source: 'follio-voice' });

export type FollioVoiceDraft = {
  headline: string | null;
  about: string | null;
};

const SYSTEM_PROMPT = `You rewrite résumé text into Follio copy.

A Follio is a first impression after someone scans a QR code — not a résumé,
not a LinkedIn about, not a job-search objective. High-level signal only.

Rules:
- Headline: one identity line (role or craft). No keyword soup, no pipes, no "seeking".
- About: one or two sentences. Who they are and what they do. Ground every claim in the source.
- No first person. No buzzwords (results-driven, passionate, proven track record).
- No skill dumps, no tools lists, no "responsible for".
- Never invent employers, titles, metrics, or facts.
- If the source is thin, write less — do not pad.

Return ONLY JSON: { "headline": "string or null", "about": "string or null" }`;

export function buildFollioVoiceUserPrompt(data: NormalizedResumeData): string {
  const name =
    [data.profile.firstName, data.profile.lastName].filter(Boolean).join(' ') || 'This person';
  const current = data.experiences.find((item) => item.isCurrent) ?? data.experiences[0] ?? null;

  const roles = data.experiences.slice(0, 4).map((item) => ({
    role: item.role,
    company: item.company,
    current: Boolean(item.isCurrent),
    proof: (item.bullets ?? []).slice(0, 3),
  }));

  return [
    `Person: ${name}`,
    `Headline on file: ${data.profile.headline || 'none'}`,
    `Summary on file: ${data.profile.summary || 'none'}`,
    current ? `Current role: ${current.role} at ${current.company}` : 'Current role: unknown',
    `Skills: ${(data.skills ?? []).slice(0, 8).join(', ') || 'none'}`,
    `Recent roles:\n${JSON.stringify(roles)}`,
  ].join('\n');
}

export function sanitizeFollioVoiceDraft(
  draft: Partial<FollioVoiceDraft> | null | undefined,
  source: Pick<NormalizedResumeData, 'profile'>
): FollioVoiceDraft {
  return {
    headline: rewriteHeadline(draft?.headline) ?? rewriteHeadline(source.profile.headline),
    about: rewriteAbout(draft?.about) ?? rewriteAbout(source.profile.summary),
  };
}

export function applyFollioVoiceToNormalized(
  data: NormalizedResumeData,
  draft: FollioVoiceDraft
): NormalizedResumeData {
  return {
    ...data,
    profile: {
      ...data.profile,
      ...(draft.headline ? { headline: draft.headline } : {}),
      ...(draft.about ? { summary: draft.about } : {}),
    },
  };
}

function deterministicDraft(data: NormalizedResumeData): FollioVoiceDraft {
  return {
    headline: rewriteHeadline(data.profile.headline),
    about: rewriteAbout(data.profile.summary),
  };
}

export async function rewriteNormalizedResumeForFollio(
  data: NormalizedResumeData
): Promise<NormalizedResumeData> {
  const fallback = applyFollioVoiceToNormalized(data, deterministicDraft(data));

  if (!isAIAvailable()) return fallback;

  try {
    const { data: raw } = await executeAICall<FollioVoiceDraft>({
      stage: 'follioVoice',
      taskType: 'strategy',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildFollioVoiceUserPrompt(data),
      jsonMode: true,
    });
    return applyFollioVoiceToNormalized(data, sanitizeFollioVoiceDraft(raw, data));
  } catch (error) {
    rewriteLogger.warn('Follio voice rewrite failed; using deterministic copy', {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
