/**
 * Shared bounds for the compare screen and the alignment service.
 * One definition so the button, the API, and the model all refuse the same text.
 */

export const JD_ALIGN_LIMITS = {
  minChars: 40,
  maxChars: 24_000,
  maxAspects: 12,
  maxEvidence: 4,
  maxQuoteChars: 240,
} as const;

export function explainAlignInput(resumeText: string, jobDescription: string): string | null {
  const resume = resumeText.trim();
  const job = jobDescription.trim();
  const { minChars, maxChars } = JD_ALIGN_LIMITS;

  if (!resume && !job) {
    return 'Paste a resume and a job description to compare them.';
  }
  if (resume.length > maxChars || job.length > maxChars) {
    return 'That text is too long to compare. Paste the resume and the posting, not the whole page.';
  }
  if (resume.length < minChars && job.length < minChars) {
    return 'Add a bit more of the resume and the job description.';
  }
  if (resume.length < minChars) return 'Add a bit more of the resume.';
  if (job.length < minChars) return 'Add a bit more of the job description.';
  return null;
}
