/**
 * Resume Design Utilities
 *
 * Resume-specific merge / font resolution on top of the shared
 * document-design token pipeline. Preview and public view share this.
 */

import {
  buildDocumentDesignStyleAttr,
  buildDocumentDesignStyles,
  mergeTextStyle,
  type ResolvedDocumentPaperTokens,
} from '@/lib/document-design';
import { getResumeTemplate, getResumeTemplateId } from '@/lib/resume/templates';
import {
  RESUME_DESIGN_DEFAULTS,
  RESUME_TEXT_STYLE_DEFAULTS,
  type ResumeDesign,
  type ResumeFontFamily,
  type ResumeTextStyle,
} from '@/types';

// Re-export page-layout helpers so existing `@/lib/resume-design` imports keep working.
export {
  getAllowedPdfLayouts,
  getResumePageSize,
  getResumeSheetWidthPx,
  isPagedPageLayout,
  resolveResumePageLayout,
} from '@/lib/resume/page-layout';

/** Resolved font roles used by CSS vars and the font loader. */
export interface ResolvedResumeFonts {
  body: ResumeFontFamily;
  name: ResumeFontFamily;
  /** Professional title under the name (`.resume-headline`) */
  title: ResumeFontFamily;
  /** Section headings (EXPERIENCE, EDUCATION, …) */
  heading: ResumeFontFamily;
  /** Email / phone / contact block */
  contact: ResumeFontFamily;
}

export interface ResolvedResumeTextStyles {
  name: ResumeTextStyle;
  title: ResumeTextStyle;
  heading: ResumeTextStyle;
  body: ResumeTextStyle;
  contact: ResumeTextStyle;
}

export type ResumeTypographyRole = 'name' | 'title' | 'heading' | 'body' | 'contact';

/** Template-recommended font for a typography role (used to pin the top of the picker). */
export function getTemplateDefaultFont(
  templateId: ResumeDesign['templateId'],
  role: ResumeTypographyRole
): ResumeFontFamily {
  const td = getResumeTemplate(getResumeTemplateId(templateId)).designDefaults;
  switch (role) {
    case 'name':
      return td.nameFontFamily ?? RESUME_DESIGN_DEFAULTS.nameFontFamily;
    case 'title':
      return td.titleFontFamily ?? RESUME_DESIGN_DEFAULTS.titleFontFamily;
    case 'heading':
      return td.headingFontFamily ?? RESUME_DESIGN_DEFAULTS.headingFontFamily;
    case 'contact':
      return td.contactFontFamily ?? RESUME_DESIGN_DEFAULTS.contactFontFamily;
    case 'body':
    default:
      return td.fontFamily ?? RESUME_DESIGN_DEFAULTS.fontFamily;
  }
}

/**
 * Resolve name / title / heading / body / contact fonts with backward-compatible fallbacks:
 * - body ← fontFamily
 * - name ← nameFontFamily ?? body (Atelier defaults to Great Vibes)
 * - heading ← headingFontFamily ?? system UI (Atelier defaults to Lato)
 * - title ← titleFontFamily ?? heading (Atelier) / body (others)
 * - contact ← contactFontFamily ?? template default (system / lato / body)
 */
export function resolveResumeFonts(raw: ResumeDesign | null | undefined): ResolvedResumeFonts {
  const templateId = getResumeTemplateId(raw?.templateId);
  const body = raw?.fontFamily ?? getTemplateDefaultFont(templateId, 'body');
  const isAtelier = templateId === 'atelier';
  const heading = raw?.headingFontFamily ?? getTemplateDefaultFont(templateId, 'heading');
  const name =
    raw?.nameFontFamily ?? (isAtelier ? getTemplateDefaultFont(templateId, 'name') : body);
  return {
    body,
    name,
    heading,
    title: raw?.titleFontFamily ?? (isAtelier ? getTemplateDefaultFont(templateId, 'title') : body),
    contact: raw?.contactFontFamily ?? getTemplateDefaultFont(templateId, 'contact'),
  };
}

/** Resolve B/I/U per role, preferring template defaults when unset. */
export function resolveResumeTextStyles(
  raw: ResumeDesign | null | undefined
): ResolvedResumeTextStyles {
  const templateId = getResumeTemplateId(raw?.templateId);
  const td = getResumeTemplate(templateId).designDefaults;
  return {
    name: mergeTextStyle(
      raw?.nameStyle,
      td.nameStyle ?? RESUME_DESIGN_DEFAULTS.nameStyle ?? RESUME_TEXT_STYLE_DEFAULTS
    ),
    title: mergeTextStyle(
      raw?.titleStyle,
      td.titleStyle ?? RESUME_DESIGN_DEFAULTS.titleStyle ?? RESUME_TEXT_STYLE_DEFAULTS
    ),
    heading: mergeTextStyle(
      raw?.headingStyle,
      td.headingStyle ?? RESUME_DESIGN_DEFAULTS.headingStyle ?? RESUME_TEXT_STYLE_DEFAULTS
    ),
    body: mergeTextStyle(
      raw?.bodyStyle,
      td.bodyStyle ?? RESUME_DESIGN_DEFAULTS.bodyStyle ?? RESUME_TEXT_STYLE_DEFAULTS
    ),
    contact: mergeTextStyle(
      raw?.contactStyle,
      td.contactStyle ?? RESUME_DESIGN_DEFAULTS.contactStyle ?? RESUME_TEXT_STYLE_DEFAULTS
    ),
  };
}

/** Merge stored design with defaults, resolving unset font roles. */
export function mergeResumeDesign(raw: ResumeDesign | null | undefined): Required<ResumeDesign> {
  const fonts = resolveResumeFonts(raw);
  const styles = resolveResumeTextStyles(raw);
  const templateId = getResumeTemplateId(raw?.templateId);
  const templateDefaults = getResumeTemplate(templateId).designDefaults;

  return {
    ...RESUME_DESIGN_DEFAULTS,
    ...(raw ?? {}),
    templateId,
    fontFamily: fonts.body,
    nameFontFamily: fonts.name,
    titleFontFamily: fonts.title,
    headingFontFamily: fonts.heading,
    contactFontFamily: fonts.contact,
    nameStyle: styles.name,
    titleStyle: styles.title,
    headingStyle: styles.heading,
    bodyStyle: styles.body,
    contactStyle: styles.contact,
    headerAlignment:
      raw?.headerAlignment ??
      templateDefaults.headerAlignment ??
      RESUME_DESIGN_DEFAULTS.headerAlignment,
    headerPhotoLayout:
      raw?.headerPhotoLayout ??
      templateDefaults.headerPhotoLayout ??
      RESUME_DESIGN_DEFAULTS.headerPhotoLayout,
    photoSize: raw?.photoSize ?? templateDefaults.photoSize ?? RESUME_DESIGN_DEFAULTS.photoSize,
    nameFontSize:
      raw?.nameFontSize ?? templateDefaults.nameFontSize ?? RESUME_DESIGN_DEFAULTS.nameFontSize,
    titleFontSize:
      raw?.titleFontSize ?? templateDefaults.titleFontSize ?? RESUME_DESIGN_DEFAULTS.titleFontSize,
    headingFontSize:
      raw?.headingFontSize ??
      templateDefaults.headingFontSize ??
      RESUME_DESIGN_DEFAULTS.headingFontSize,
    contactFontSize:
      raw?.contactFontSize ??
      templateDefaults.contactFontSize ??
      RESUME_DESIGN_DEFAULTS.contactFontSize,
  };
}

function toPaperTokens(raw: ResumeDesign | null | undefined): ResolvedDocumentPaperTokens {
  const d = mergeResumeDesign(raw);
  return {
    headingColor: d.headingColor,
    accentColor: d.accentColor,
    fonts: resolveResumeFonts(raw),
    textStyles: resolveResumeTextStyles(raw),
    fontSize: d.fontSize,
    nameFontSize: d.nameFontSize,
    titleFontSize: d.titleFontSize,
    headingFontSize: d.headingFontSize,
    contactFontSize: d.contactFontSize,
    photoSize: d.photoSize,
    headerAlignment: d.headerAlignment,
    density: d.density,
    dividerStyle: d.dividerStyle,
    justifyAll: d.justifyAll,
  };
}

/**
 * Build a CSS custom-properties object (for React `style` prop) from the
 * given ResumeDesign settings. Missing values fall back to defaults.
 *
 * The resume CSS classes reference these via `var(--rd-*)`.
 */
export function buildResumeDesignStyles(raw: ResumeDesign | null | undefined): React.CSSProperties {
  return buildDocumentDesignStyles(toPaperTokens(raw));
}

/**
 * Build a CSS `style` attribute string with all `--rd-*` custom properties.
 * Used by PDF export where inline styles are required.
 */
export function buildResumeDesignStyleAttr(raw: ResumeDesign | null | undefined): string {
  return buildDocumentDesignStyleAttr(toPaperTokens(raw));
}

/**
 * Parse the resumeDesign from a profile object (handles JSON or object).
 */
export function parseResumeDesign(raw: unknown): ResumeDesign | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ResumeDesign;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as ResumeDesign;
  return null;
}
