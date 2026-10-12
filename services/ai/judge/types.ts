/** One recruiter observation. The label is the lens, the note is one sentence. */
export interface ExpertNote {
  label: string;
  note: string;
}

/**
 * Holistic match from a recruiter's read: the top of the resume, keywords,
 * and whatever else would change a screen. Null when that read did not come back.
 */
export interface ExpertRead {
  /** 0–100. Higher means a recruiter is more likely to move the resume forward. */
  score: number;
  summary: string;
  notes: ExpertNote[];
}

/** Score bands shared by every screen that shows a recruiter read. */
export function expertBand(score: number): 'Strong' | 'Plausible' | 'Partial' | 'Weak' {
  if (score >= 85) return 'Strong';
  if (score >= 65) return 'Plausible';
  if (score >= 40) return 'Partial';
  return 'Weak';
}
