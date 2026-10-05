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
- If a résumé summary is present, return "about": null. That summary is user-provided source
  material and must never be rewritten, shortened, corrected, or otherwise changed.
- If the résumé summary is missing, create "about": a one- or two-sentence professional
  summary grounded only in the supplied roles, skills, and achievements.
- No first person. No buzzwords (results-driven, passionate, proven track record).
- No skill dumps, no tools lists, no "responsible for".
- Never invent employers, titles, metrics, or facts.
- If the source is thin, write less — do not pad.

Return ONLY JSON: { "headline": "string or null", "about": "string or null" }`;

function hasSummary(summary: string | null | undefined): summary is string {
  return typeof summary === 'string' && summary.trim().length > 0;
}

export function buildFollioVoiceUserPrompt(data: NormalizedResumeData): string {
  const name =
    [data.profile.firstName, data.profile.lastName].filter(Boolean).join(' ') || 'This person';
  const current = data.experiences.find((item) => item.isCurrent) ?? data.experiences[0] ?? null;
  const summary = data.profile.summary;

  const roles = data.experiences.slice(0, 4).map((item) => ({
    role: item.role,
    company: item.company,
    current: Boolean(item.isCurrent),
    proof: (item.bullets ?? []).slice(0, 3),
  }));

  return [
    `Person: ${name}`,
    `Headline on file: ${data.profile.headline || 'none'}`,
    `Summary status: ${hasSummary(summary) ? 'present' : 'missing'}`,
    hasSummary(summary)
      ? `Existing summary (preserve verbatim; return "about": null):\n<resume_summary>\n${summary}\n</resume_summary>`
      : 'Existing summary: none — generate "about" from the facts below.',
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
    about: hasSummary(source.profile.summary) ? null : rewriteAbout(draft?.about),
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
      // The parsed résumé summary is source material. The generator may only
      // fill this field when extraction found no summary at all.
      ...(!hasSummary(data.profile.summary) && draft.about ? { summary: draft.about } : {}),
    },
  };
}

function deterministicDraft(data: NormalizedResumeData): FollioVoiceDraft {
  const current = data.experiences.find((item) => item.isCurrent) ?? data.experiences[0];
  const roleAndCompany =
    current?.role && current?.company ? `${current.role} at ${current.company}.` : null;
  const proof = current?.bullets?.find((bullet) => bullet.trim().length > 0) ?? null;

  return {
    headline: rewriteHeadline(data.profile.headline),
    about: hasSummary(data.profile.summary)
      ? null
      : rewriteAbout([roleAndCompany, proof].filter(Boolean).join(' ')),
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
