/**
 * Cover letter design = shared DocumentDesign + letter template particulars.
 */

import {
  DOCUMENT_DESIGN_DEFAULTS,
  defaultResolvedFonts,
  defaultResolvedTextStyles,
  buildDocumentDesignStyleAttr,
  buildDocumentDesignStyles,
  pickDocumentDesign,
  type DocumentDesign,
  type ResolvedDocumentPaperTokens,
} from '@/lib/document-design';

/** Cover letter layout kits — presentation only. */
export type CoverLetterTemplateId = 'classic';

export interface CoverLetterDesign extends DocumentDesign {
  templateId?: CoverLetterTemplateId;
}

export const COVER_LETTER_DESIGN_DEFAULTS: Required<CoverLetterDesign> = {
  ...DOCUMENT_DESIGN_DEFAULTS,
  templateId: 'classic',
  /** Letters read denser; no resume-style oversized name header. */
  nameFontSize: 13,
  fontSize: 13,
  nameStyle: { bold: true, italic: false, underline: false },
};

export function isValidCoverLetterTemplateId(value: unknown): value is CoverLetterTemplateId {
  return value === 'classic';
}

export function mergeCoverLetterDesign(
  raw: CoverLetterDesign | null | undefined
): Required<CoverLetterDesign> {
  const fonts = defaultResolvedFonts(raw);
  const styles = defaultResolvedTextStyles(raw);
  return {
    ...COVER_LETTER_DESIGN_DEFAULTS,
    ...(raw ?? {}),
    templateId: isValidCoverLetterTemplateId(raw?.templateId)
      ? raw!.templateId!
      : COVER_LETTER_DESIGN_DEFAULTS.templateId,
    fontFamily: fonts.body,
    nameFontFamily: fonts.name,
    headingFontFamily: fonts.heading,
    nameStyle: styles.name,
    headingStyle: styles.heading,
    bodyStyle: styles.body,
  };
}

function toPaperTokens(raw: CoverLetterDesign | null | undefined): ResolvedDocumentPaperTokens {
  const d = mergeCoverLetterDesign(raw);
  const fonts = defaultResolvedFonts(raw);
  const textStyles = defaultResolvedTextStyles(raw);
  return {
    headingColor: d.headingColor,
    accentColor: d.accentColor,
    fonts,
    textStyles,
    fontSize: d.fontSize,
    nameFontSize: d.nameFontSize,
    titleFontSize: d.fontSize,
    headingFontSize: d.headingFontSize,
    contactFontSize: d.fontSize,
    photoSize: 80,
    headerAlignment: 'left',
    density: d.density,
    dividerStyle: d.dividerStyle,
    justifyAll: d.justifyAll,
  };
}

export function buildCoverLetterDesignStyles(
  raw: CoverLetterDesign | null | undefined
): React.CSSProperties {
  return buildDocumentDesignStyles(toPaperTokens(raw));
}

export function buildCoverLetterDesignStyleAttr(raw: CoverLetterDesign | null | undefined): string {
  return buildDocumentDesignStyleAttr(toPaperTokens(raw));
}

export function parseCoverLetterDesign(raw: unknown): CoverLetterDesign | null {
  if (!raw) return null;
  let obj: CoverLetterDesign;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as CoverLetterDesign;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    obj = raw as CoverLetterDesign;
  } else {
    return null;
  }
  return {
    ...pickDocumentDesign({ ...DOCUMENT_DESIGN_DEFAULTS, ...obj }),
    templateId: isValidCoverLetterTemplateId(obj.templateId) ? obj.templateId : 'classic',
  };
}

/** Copy shared paper fields from a resume design into a cover letter design. */
export function designFromResumePaper(
  resumeDesign: DocumentDesign | null | undefined
): CoverLetterDesign {
  if (!resumeDesign) return { ...COVER_LETTER_DESIGN_DEFAULTS };
  return {
    ...COVER_LETTER_DESIGN_DEFAULTS,
    ...pickDocumentDesign(resumeDesign as DocumentDesign & Record<string, unknown>),
    templateId: 'classic',
  };
}
