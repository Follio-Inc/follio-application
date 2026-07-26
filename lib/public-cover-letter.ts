/**
 * Public / unlisted cover letter resolution.
 *
 * Unlisted URL: follio.me/cl/{unlistedKey} (opaque — no username).
 * Cover letters are never PUBLIC.
 *
 * Uses React `cache()` (request-scoped) — not `unstable_cache` — so revoke /
 * PRIVATE immediately stop serving the prior key within the same process.
 */

import { cache } from 'react';

import {
  mergeCoverLetterContent,
  mergeCoverLetterDesign,
  parseCoverLetterContent,
  parseCoverLetterDesign,
  type CoverLetterContent,
  type CoverLetterDesign,
} from '@/lib/cover-letter';
import {
  normalizeCoverLetterVisibility,
  type CoverLetterVisibility,
} from '@/lib/cover-letter/visibility';
import { db } from '@/lib/db';

export interface PublicCoverLetter {
  id: string;
  title: string;
  visibility: CoverLetterVisibility;
  content: Required<CoverLetterContent>;
  design: Required<CoverLetterDesign>;
}

/**
 * Resolve an unlisted cover letter by opaque key.
 * Only returns letters with visibility === UNLISTED (never PRIVATE / PUBLIC).
 */
export const resolveCoverLetterByUnlistedKey = cache(
  async (key: string): Promise<PublicCoverLetter | null> => {
    const trimmed = key?.trim();
    if (!trimmed) return null;

    const letter = await db.coverLetter.findFirst({
      where: {
        unlistedKey: trimmed,
        isArchived: false,
        visibility: 'UNLISTED',
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        content: true,
        design: true,
      },
    });

    if (!letter) return null;

    return {
      id: letter.id,
      title: letter.title,
      visibility: normalizeCoverLetterVisibility(letter.visibility),
      content: mergeCoverLetterContent(parseCoverLetterContent(letter.content)),
      design: mergeCoverLetterDesign(parseCoverLetterDesign(letter.design)),
    };
  }
);
