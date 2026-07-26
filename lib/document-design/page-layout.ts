/**
 * Shared page layout sizes and download gating for paper documents.
 *
 * Continuous = single digital scroll (Letter width).
 * A4 / Letter = print-style pages with breaks at that paper size.
 */

import type { DocumentDesign, DocumentPageLayout } from './types';

/** Legacy value stored before A4/Letter split — treated as Letter. */
export type LegacyDocumentPageLayout = 'paged';

export type StoredDocumentPageLayout = DocumentPageLayout | LegacyDocumentPageLayout;

/** US Letter at 96dpi (8.5″ × 11″). */
export const LETTER_PAGE_WIDTH_PX = 816;
export const LETTER_PAGE_HEIGHT_PX = 1056;

/** ISO A4 at 96dpi (210mm × 297mm). */
export const A4_PAGE_WIDTH_PX = 794;
export const A4_PAGE_HEIGHT_PX = 1123;

/** Vertical break inset — matches `.resume-paper` padding-y. */
export const DOCUMENT_PAGE_MARGIN_Y_PX = 48;

/** @deprecated Prefer DOCUMENT_PAGE_MARGIN_Y_PX */
export const RESUME_PAGE_MARGIN_Y_PX = DOCUMENT_PAGE_MARGIN_Y_PX;

export interface DocumentPageSize {
  widthPx: number;
  heightPx: number;
  /** Puppeteer `page.pdf({ format })` value when paged. */
  pdfFormat: 'A4' | 'Letter';
}

/** @deprecated Prefer DocumentPageSize */
export type ResumePageSize = DocumentPageSize;

const PAGE_SIZES: Record<'a4' | 'letter', DocumentPageSize> = {
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
export function resolveDocumentPageLayout(
  raw: Pick<DocumentDesign, 'pageLayout'> | null | undefined
): DocumentPageLayout {
  const value = raw?.pageLayout as StoredDocumentPageLayout | undefined;
  if (value === 'a4') return 'a4';
  if (value === 'letter' || value === 'paged') return 'letter';
  return 'continuous';
}

/** @deprecated Prefer resolveDocumentPageLayout */
export const resolveResumePageLayout = resolveDocumentPageLayout;

export function isPagedPageLayout(layout: DocumentPageLayout): boolean {
  return layout === 'a4' || layout === 'letter';
}

/**
 * Download options gated by the document's live page layout.
 * - continuous → Continuous, A4, Letter
 * - a4 / letter → A4 and Letter only
 */
export function getAllowedPdfLayouts(pageLayout: DocumentPageLayout): DocumentPageLayout[] {
  if (isPagedPageLayout(pageLayout)) return ['a4', 'letter'];
  return ['continuous', 'a4', 'letter'];
}

const PDF_LAYOUT_QUERY_VALUES = new Set(['continuous', 'a4', 'letter', 'paged']);

/**
 * Normalize `?layout=` query params for PDF routes.
 * Accepts legacy `paged` → `letter`. Unknown values fall back to `fallback`.
 */
export function parsePdfLayoutQueryParam(
  raw: string | null | undefined,
  fallback: DocumentPageLayout = 'letter'
): DocumentPageLayout {
  if (!raw || !PDF_LAYOUT_QUERY_VALUES.has(raw)) return fallback;
  if (raw === 'continuous' || raw === 'a4' || raw === 'letter') return raw;
  return 'letter';
}

/** Paper size for A4/Letter layouts. Continuous uses Letter width digitally. */
export function getDocumentPageSize(layout: DocumentPageLayout): DocumentPageSize {
  if (layout === 'a4') return PAGE_SIZES.a4;
  return PAGE_SIZES.letter;
}

/** @deprecated Prefer getDocumentPageSize */
export const getResumePageSize = getDocumentPageSize;

/** Digital continuous sheet width (matches historical preview). */
export function getDocumentSheetWidthPx(layout: DocumentPageLayout): number {
  return getDocumentPageSize(layout).widthPx;
}

/** @deprecated Prefer getDocumentSheetWidthPx */
export const getResumeSheetWidthPx = getDocumentSheetWidthPx;

export function getPagedContentBandHeights(pageHeightPx: number): {
  firstPage: number;
  laterPage: number;
} {
  return {
    firstPage: pageHeightPx - DOCUMENT_PAGE_MARGIN_Y_PX,
    laterPage: pageHeightPx - DOCUMENT_PAGE_MARGIN_Y_PX * 2,
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
