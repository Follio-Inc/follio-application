import { describe, expect, it } from 'vitest';

import { getResumeZoomFitScale } from '@/app/(dashboard)/builder/components/resume-zoom-modal';
import {
  A4_PAGE_WIDTH_PX,
  LETTER_PAGE_WIDTH_PX,
  getResumeSheetWidthPx,
  resolveResumePageLayout,
} from '@/lib/resume/page-layout';

describe('getResumeZoomFitScale', () => {
  it('scales down uniformly when the viewport is narrower than the sheet', () => {
    expect(getResumeZoomFitScale(408, LETTER_PAGE_WIDTH_PX)).toBeCloseTo(0.5);
  });

  it('caps at 1× so the resume is never upscaled past native fidelity', () => {
    expect(getResumeZoomFitScale(1600, LETTER_PAGE_WIDTH_PX)).toBe(1);
  });

  it('uses A4 native width when computing fit for an A4 resume', () => {
    const a4Width = getResumeSheetWidthPx(resolveResumePageLayout({ pageLayout: 'a4' }));
    expect(a4Width).toBe(A4_PAGE_WIDTH_PX);
    expect(getResumeZoomFitScale(a4Width, a4Width)).toBe(1);
    expect(getResumeZoomFitScale(a4Width / 2, a4Width)).toBeCloseTo(0.5);
  });

  it('returns 1 for invalid dimensions instead of NaN/Infinity', () => {
    expect(getResumeZoomFitScale(0, LETTER_PAGE_WIDTH_PX)).toBe(1);
    expect(getResumeZoomFitScale(800, 0)).toBe(1);
  });
});
