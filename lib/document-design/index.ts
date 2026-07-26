/**
 * Shared document design architect.
 *
 * Resume and cover letter compose this layer; document-specific layout
 * kits and content models live beside it, not inside it.
 */

export type {
  DocumentColorTheme,
  DocumentDensity,
  DocumentDesign,
  DocumentDividerStyle,
  DocumentFontFamily,
  DocumentPageLayout,
  DocumentTextStyle,
  PdfLayout,
} from './types';

export {
  DOCUMENT_DESIGN_DEFAULTS,
  DOCUMENT_FONT_LABELS,
  DOCUMENT_FONT_MAP,
  DOCUMENT_FONT_OPTIONS,
  DOCUMENT_TEXT_STYLE_DEFAULTS,
} from './types';

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
} from './page-layout';

export {
  buildDocumentDesignStyleAttr,
  buildDocumentDesignStyles,
  defaultResolvedFonts,
  defaultResolvedTextStyles,
  getDarkModeColor,
  mergeTextStyle,
  parseDocumentDesign,
  pickDocumentDesign,
  type ResolvedDocumentFonts,
  type ResolvedDocumentPaperTokens,
  type ResolvedDocumentTextStyles,
} from './styles';

export {
  isValidHexColor,
  validateDocumentDesign,
  VALID_COLOR_THEMES,
  VALID_FONT_FAMILIES,
  VALID_PAGE_LAYOUTS,
  LEGACY_PAGE_LAYOUTS,
  type DesignValidationResult,
} from './validate';

export { resolveDocumentColorTheme, resolveResumeColorTheme } from './color-theme';
