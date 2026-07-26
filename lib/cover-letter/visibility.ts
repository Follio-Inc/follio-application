/**
 * Cover letter visibility — PRIVATE | UNLISTED only (never PUBLIC).
 */

import type { ContentVisibility } from '@prisma/client';

export const COVER_LETTER_VISIBILITIES = ['PRIVATE', 'UNLISTED'] as const;

export type CoverLetterVisibility = (typeof COVER_LETTER_VISIBILITIES)[number];

export function isCoverLetterVisibility(value: unknown): value is CoverLetterVisibility {
  return value === 'PRIVATE' || value === 'UNLISTED';
}

export function normalizeCoverLetterVisibility(
  value: ContentVisibility | string | null | undefined
): CoverLetterVisibility {
  return value === 'UNLISTED' ? 'UNLISTED' : 'PRIVATE';
}
