/**
 * Validate pasted job-description text for the recruiter lens.
 * Scoring stays on-device; this only gates obviously unusable input.
 */

export const MIN_JD_CHARS = 40;
export const MAX_JD_CHARS = 80_000;

export type JdValidation = { ok: true; jd: string } | { ok: false; message: string };

/**
 * True when the paste is essentially a URL (recruiters often paste the
 * posting link). We cannot fetch that page from the viewer.
 */
export function isLikelyUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lines = trimmed
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 3) return false;
  const joined = lines.join(' ');
  if (joined.length > 400) return false;
  return /^https?:\/\/\S+$/i.test(joined);
}

export function validateJobDescription(raw: string): JdValidation {
  const jd = raw.trim();
  if (!jd) {
    return { ok: false, message: 'Paste a job description to highlight matching evidence.' };
  }
  if (isLikelyUrlOnly(jd)) {
    return { ok: false, message: 'Paste the job description text, not the link.' };
  }
  if (jd.length < MIN_JD_CHARS) {
    return { ok: false, message: 'Need a bit more of the job description to find matches.' };
  }
  if (jd.length > MAX_JD_CHARS) {
    return {
      ok: false,
      message: 'That description is too long. Paste the role summary and requirements.',
    };
  }
  return { ok: true, jd };
}
