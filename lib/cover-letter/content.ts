/**
 * Cover letter content model (stored as JSON on CoverLetter.content).
 */

export interface CoverLetterContent {
  /** Hiring manager / recipient name */
  recipientName?: string;
  /** Recipient role / title */
  recipientTitle?: string;
  /** Company or organization */
  company?: string;
  /** Optional company address lines */
  companyAddress?: string;
  /** Display date string (e.g. "July 25, 2026") */
  date?: string;
  /** Salutation, e.g. "Dear Hiring Manager," */
  greeting?: string;
  /** Letter body — plain text; paragraphs separated by blank lines */
  body?: string;
  /** Closing, e.g. "Sincerely," */
  closing?: string;
  /** Sender / signature name */
  signatureName?: string;
}

export const COVER_LETTER_CONTENT_DEFAULTS: Required<CoverLetterContent> = {
  recipientName: '',
  recipientTitle: '',
  company: '',
  companyAddress: '',
  date: '',
  greeting: 'Dear Hiring Manager,',
  body: '',
  closing: 'Sincerely,',
  signatureName: '',
};

export function mergeCoverLetterContent(
  raw: CoverLetterContent | null | undefined
): Required<CoverLetterContent> {
  return {
    ...COVER_LETTER_CONTENT_DEFAULTS,
    ...(raw ?? {}),
  };
}

export function parseCoverLetterContent(raw: unknown): CoverLetterContent | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as CoverLetterContent;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as CoverLetterContent;
  return null;
}

/** Split body into paragraphs for rendering. */
export function coverLetterBodyParagraphs(body: string | undefined): string[] {
  if (!body?.trim()) return [];
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
