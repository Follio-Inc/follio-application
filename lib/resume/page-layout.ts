/**
 * Resume page layout sizes and download gating.
 *
 * Continuous = single digital scroll (Letter width).
 * A4 / Letter = print-style pages with breaks at that paper size.
 */

import type { ResumeDesign, ResumePageLayout } from '@/types';

/** Legacy value stored before A4/Letter split — treated as Letter. */
export type LegacyResumePageLayout = 'paged';

export type StoredResumePageLayout = ResumePageLayout | LegacyResumePageLayout;

/** US Letter at 96dpi (8.5″ × 11″). */
export const LETTER_PAGE_WIDTH_PX = 816;
export const LETTER_PAGE_HEIGHT_PX = 1056;

/** ISO A4 at 96dpi (210mm × 297mm). */
export const A4_PAGE_WIDTH_PX = 794;
export const A4_PAGE_HEIGHT_PX = 1123;

/** Vertical break inset — matches `.resume-paper` padding-y. */
export const RESUME_PAGE_MARGIN_Y_PX = 48;

export interface ResumePageSize {
  widthPx: number;
  heightPx: number;
  /** Puppeteer `page.pdf({ format })` value when paged. */
  pdfFormat: 'A4' | 'Letter';
}

const PAGE_SIZES: Record<'a4' | 'letter', ResumePageSize> = {
  letter: {
    widthPx: LETTER_PAGE_WIDTH_PX,
    heightPx: LETTER_PAGE_HEIGHT_PX,
    pdfFormat: 'Letter',
  },
  a4: {
    widthPx: A4_PAGE_WIDTH_PX,
    heightPx: A4_PAGE_HEIGHT_PX,
    pdfFormat: 'A4',
  },
};

/** Normalize stored / legacy layout values to the current union. */
export function resolveResumePageLayout(raw: ResumeDesign | null | undefined): ResumePageLayout {
  const value = raw?.pageLayout as StoredResumePageLayout | undefined;
  if (value === 'a4') return 'a4';
  if (value === 'letter' || value === 'paged') return 'letter';
  return 'continuous';
}

export function isPagedPageLayout(layout: ResumePageLayout): boolean {
  return layout === 'a4' || layout === 'letter';
}

/**
 * Download options gated by the resume's live page layout.
 * - continuous → Continuous, A4, Letter
 * - a4 / letter → A4 and Letter only
 */
export function getAllowedPdfLayouts(pageLayout: ResumePageLayout): ResumePageLayout[] {
  if (isPagedPageLayout(pageLayout)) return ['a4', 'letter'];
  return ['continuous', 'a4', 'letter'];
}

/** Paper size for A4/Letter layouts. Continuous uses Letter width digitally. */
export function getResumePageSize(layout: ResumePageLayout): ResumePageSize {
  if (layout === 'a4') return PAGE_SIZES.a4;
  return PAGE_SIZES.letter;
}

/** Digital continuous sheet width (matches historical preview). */
export function getResumeSheetWidthPx(layout: ResumePageLayout): number {
  return getResumePageSize(layout).widthPx;
}

export function getPagedContentBandHeights(pageHeightPx: number): {
  firstPage: number;
  laterPage: number;
} {
  return {
    firstPage: pageHeightPx - RESUME_PAGE_MARGIN_Y_PX,
    laterPage: pageHeightPx - RESUME_PAGE_MARGIN_Y_PX * 2,
  };
}

export function getPagedContentOffset(pageIndex: number, pageHeightPx: number): number {
  const { firstPage, laterPage } = getPagedContentBandHeights(pageHeightPx);
  if (pageIndex <= 0) return 0;
  return firstPage + (pageIndex - 1) * laterPage;
}

export function getPagedPageCount(contentHeightPx: number, pageHeightPx: number): number {
  const { firstPage, laterPage } = getPagedContentBandHeights(pageHeightPx);
  if (contentHeightPx <= firstPage) return 1;
  return 1 + Math.ceil((contentHeightPx - firstPage) / laterPage);
}
