/**
 * Resume page layout — thin re-export of the shared document page-layout module.
 * Resume call sites keep importing from here; new code should prefer
 * `@/lib/document-design`.
 */

export {
  A4_PAGE_HEIGHT_PX,
  A4_PAGE_WIDTH_PX,
  DOCUMENT_PAGE_MARGIN_Y_PX,
  LETTER_PAGE_HEIGHT_PX,
  LETTER_PAGE_WIDTH_PX,
  RESUME_PAGE_MARGIN_Y_PX,
  getAllowedPdfLayouts,
  getDocumentPageSize,
  getDocumentSheetWidthPx,
  getPagedContentBandHeights,
  getPagedContentOffset,
  getPagedPageCount,
  getResumePageSize,
  getResumeSheetWidthPx,
  isPagedPageLayout,
  resolveDocumentPageLayout,
  resolveResumePageLayout,
  type DocumentPageSize,
  type LegacyDocumentPageLayout,
  type ResumePageSize,
  type StoredDocumentPageLayout,
} from '@/lib/document-design/page-layout';

/** @deprecated Prefer LegacyDocumentPageLayout */
export type LegacyResumePageLayout =
  import('@/lib/document-design/page-layout').LegacyDocumentPageLayout;
/** @deprecated Prefer StoredDocumentPageLayout */
export type StoredResumePageLayout =
  import('@/lib/document-design/page-layout').StoredDocumentPageLayout;
