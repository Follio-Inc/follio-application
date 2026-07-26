/**
 * Cover letter content model (stored as JSON on CoverLetter.content).
 */

import { z } from 'zod';

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

const CONTENT_KEYS = [
  'recipientName',
  'recipientTitle',
  'company',
  'companyAddress',
  'date',
  'greeting',
  'body',
  'closing',
  'signatureName',
] as const satisfies ReadonlyArray<keyof CoverLetterContent>;

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

/** Zod schema for PATCH content — known string fields with length caps. */
export const coverLetterContentPatchSchema = z
  .object({
    recipientName: z.string().max(200).optional(),
    recipientTitle: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    companyAddress: z.string().max(500).optional(),
    date: z.string().max(100).optional(),
    greeting: z.string().max(200).optional(),
    body: z.string().max(20000).optional(),
    closing: z.string().max(200).optional(),
    signatureName: z.string().max(200).optional(),
  })
  .strict();

/** Keep only known string fields — drops junk keys from stored JSON. */
export function pickCoverLetterContent(raw: Record<string, unknown>): CoverLetterContent {
  const out: CoverLetterContent = {};
  for (const key of CONTENT_KEYS) {
    const value = raw[key];
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

export function mergeCoverLetterContent(
  raw: CoverLetterContent | null | undefined
): Required<CoverLetterContent> {
  const picked = pickCoverLetterContent((raw ?? {}) as Record<string, unknown>);
  return {
    ...COVER_LETTER_CONTENT_DEFAULTS,
    ...picked,
  };
}

export function parseCoverLetterContent(raw: unknown): CoverLetterContent | null {
  if (!raw) return null;
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  return pickCoverLetterContent(obj as Record<string, unknown>);
}

/** Split body into paragraphs for rendering. */
export function coverLetterBodyParagraphs(body: string | undefined): string[] {
  if (!body?.trim()) return [];
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
