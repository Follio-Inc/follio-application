import { describe, expect, it } from 'vitest';

import {
  A4_PAGE_HEIGHT_PX,
  getAllowedPdfLayouts,
  getPagedContentOffset,
  getPagedPageCount,
  getResumePageSize,
  LETTER_PAGE_HEIGHT_PX,
  resolveResumePageLayout,
} from '@/lib/resume/page-layout';
import { RESUME_DESIGN_DEFAULTS, type ResumeDesign } from '@/types';

describe('resolveResumePageLayout', () => {
  it('defaults to continuous when unset', () => {
    expect(resolveResumePageLayout(null)).toBe('continuous');
    expect(resolveResumePageLayout(undefined)).toBe('continuous');
    expect(resolveResumePageLayout({})).toBe('continuous');
  });

  it('returns a4 and letter when stored', () => {
    expect(resolveResumePageLayout({ pageLayout: 'a4' })).toBe('a4');
    expect(resolveResumePageLayout({ pageLayout: 'letter' })).toBe('letter');
  });

  it('maps legacy paged to letter', () => {
    expect(resolveResumePageLayout({ pageLayout: 'paged' } as unknown as ResumeDesign)).toBe(
      'letter'
    );
  });

  it('matches design defaults', () => {
    expect(RESUME_DESIGN_DEFAULTS.pageLayout).toBe('continuous');
  });
});

describe('getAllowedPdfLayouts', () => {
  it('allows all three layouts for continuous resumes', () => {
    expect(getAllowedPdfLayouts('continuous')).toEqual(['continuous', 'a4', 'letter']);
  });

  it('allows only A4 and Letter for paged resumes', () => {
    expect(getAllowedPdfLayouts('a4')).toEqual(['a4', 'letter']);
    expect(getAllowedPdfLayouts('letter')).toEqual(['a4', 'letter']);
  });
});

describe('getResumePageSize', () => {
  it('returns Letter dimensions for continuous and letter', () => {
    expect(getResumePageSize('continuous')).toEqual({
      widthPx: 816,
      heightPx: LETTER_PAGE_HEIGHT_PX,
      pdfFormat: 'Letter',
    });
    expect(getResumePageSize('letter').pdfFormat).toBe('Letter');
  });

  it('returns A4 dimensions for a4', () => {
    expect(getResumePageSize('a4')).toEqual({
      widthPx: 794,
      heightPx: A4_PAGE_HEIGHT_PX,
      pdfFormat: 'A4',
    });
  });
});

describe('paged page geometry', () => {
  it('fits short content on a single first page', () => {
    const firstBand = LETTER_PAGE_HEIGHT_PX - 48;
    expect(getPagedPageCount(firstBand, LETTER_PAGE_HEIGHT_PX)).toBe(1);
    expect(getPagedContentOffset(0, LETTER_PAGE_HEIGHT_PX)).toBe(0);
  });

  it('adds later pages after the first content band', () => {
    const firstBand = LETTER_PAGE_HEIGHT_PX - 48;
    const laterBand = LETTER_PAGE_HEIGHT_PX - 96;
    const height = firstBand + laterBand + 10;
    expect(getPagedPageCount(height, LETTER_PAGE_HEIGHT_PX)).toBe(3);
    expect(getPagedContentOffset(1, LETTER_PAGE_HEIGHT_PX)).toBe(firstBand);
    expect(getPagedContentOffset(2, LETTER_PAGE_HEIGHT_PX)).toBe(firstBand + laterBand);
  });
});
