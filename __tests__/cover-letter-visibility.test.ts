import { describe, expect, it } from 'vitest';

import {
  isCoverLetterVisibility,
  normalizeCoverLetterVisibility,
} from '@/lib/cover-letter/visibility';

describe('cover letter visibility', () => {
  it('accepts only PRIVATE and UNLISTED', () => {
    expect(isCoverLetterVisibility('PRIVATE')).toBe(true);
    expect(isCoverLetterVisibility('UNLISTED')).toBe(true);
    expect(isCoverLetterVisibility('PUBLIC')).toBe(false);
    expect(isCoverLetterVisibility(null)).toBe(false);
  });

  it('normalizes unknown / PUBLIC to PRIVATE', () => {
    expect(normalizeCoverLetterVisibility('UNLISTED')).toBe('UNLISTED');
    expect(normalizeCoverLetterVisibility('PRIVATE')).toBe('PRIVATE');
    expect(normalizeCoverLetterVisibility('PUBLIC')).toBe('PRIVATE');
    expect(normalizeCoverLetterVisibility(null)).toBe('PRIVATE');
  });
});
