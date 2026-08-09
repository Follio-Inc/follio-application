/**
 * Resume template registry
 *
 * Content stays on Profile relations. Templates only change presentation via
 * `resumeDesign.templateId` (+ optional recommended design defaults on select).
 *
 * Photo visibility (`resumeShowPhoto`) is a Profile flag, not part of ResumeDesign.
 * Each template declares `defaultShowPhoto` so Restore Defaults / template apply
 * can sync photo on/off to match that template’s intended look.
 */

import { RESUME_DESIGN_DEFAULTS, type ResumeDesign } from '@/types';

import { type ResumeTemplateId, type ResumeTemplateMeta } from './types';

export const DEFAULT_RESUME_TEMPLATE_ID: ResumeTemplateId = 'classic';

/**
 * Per-template photo policy (product intent):
 * - classic / lumen: ATS-first text headers → no photo
 * - sleek / studio: identity headers designed around an avatar → photo on
 * - atelier: editorial script header has no photo slot → no photo
 */
const TEMPLATES: Record<ResumeTemplateId, ResumeTemplateMeta> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Single-column ATS-friendly layout. Clean, centered, timeless.',
    tone: 'plain',
    defaultShowPhoto: false,
    designDefaults: {
      fontFamily: 'georgia',
      nameFontFamily: 'georgia',
      titleFontFamily: 'georgia',
      headingFontFamily: 'system',
      contactFontFamily: 'system',
      headerAlignment: 'center',
      headerPhotoLayout: 'photo-left',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#000000',
      accentColor: '#000000',
      fontSize: 13,
      nameFontSize: 28,
      titleFontSize: 14,
      headingFontSize: 12,
      contactFontSize: 11,
      nameStyle: { bold: true, italic: false, underline: false },
      titleStyle: { bold: false, italic: true, underline: false },
      headingStyle: { bold: true, italic: false, underline: false },
      bodyStyle: { bold: false, italic: false, underline: false },
      contactStyle: { bold: false, italic: false, underline: false },
    },
  },
  lumen: {
    id: 'lumen',
    name: 'Lumen',
    description:
      'Single-column ATS-friendly layout. Instrument Sans, quiet spacing, modern elegance.',
    tone: 'plain',
    defaultShowPhoto: false,
    designDefaults: {
      fontFamily: 'instrument-sans',
      nameFontFamily: 'instrument-sans',
      titleFontFamily: 'instrument-sans',
      headingFontFamily: 'instrument-sans',
      contactFontFamily: 'instrument-sans',
      headerAlignment: 'left',
      headerPhotoLayout: 'photo-left',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#171717',
      accentColor: '#b0aaa3',
      fontSize: 13,
      nameFontSize: 28,
      titleFontSize: 14,
      headingFontSize: 11,
      contactFontSize: 11,
      nameStyle: { bold: true, italic: false, underline: false },
      titleStyle: { bold: false, italic: false, underline: false },
      headingStyle: { bold: true, italic: false, underline: false },
      bodyStyle: { bold: false, italic: false, underline: false },
      contactStyle: { bold: false, italic: false, underline: false },
    },
  },
  sleek: {
    id: 'sleek',
    name: 'Sleek',
    description: 'Recruiter-style two-column layout with a left label rail and airy typography.',
    tone: 'plain',
    defaultShowPhoto: true,
    designDefaults: {
      fontFamily: 'lato',
      nameFontFamily: 'lato',
      titleFontFamily: 'lato',
      headingFontFamily: 'system',
      contactFontFamily: 'system',
      headerAlignment: 'left',
      headerPhotoLayout: 'photo-left',
      photoSize: 64,
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#1f2d3d',
      accentColor: '#8f9aa8',
      fontSize: 13,
      nameFontSize: 28,
      titleFontSize: 14,
      headingFontSize: 11,
      contactFontSize: 11,
      nameStyle: { bold: true, italic: false, underline: false },
      titleStyle: { bold: false, italic: false, underline: false },
      headingStyle: { bold: true, italic: false, underline: false },
      bodyStyle: { bold: false, italic: false, underline: false },
      contactStyle: { bold: false, italic: false, underline: false },
    },
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    description:
      'Single-column layout with a teal header contact card, accent bar, and pill-style dates.',
    tone: 'accent',
    defaultShowPhoto: true,
    designDefaults: {
      fontFamily: 'open-sans',
      nameFontFamily: 'open-sans',
      titleFontFamily: 'open-sans',
      headingFontFamily: 'system',
      contactFontFamily: 'open-sans',
      headerAlignment: 'left',
      headerPhotoLayout: 'photo-left',
      photoSize: 64,
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#1a1a1a',
      accentColor: '#7a9aa5',
      fontSize: 13,
      nameFontSize: 28,
      titleFontSize: 14,
      headingFontSize: 12,
      contactFontSize: 11,
      nameStyle: { bold: true, italic: false, underline: false },
      titleStyle: { bold: false, italic: false, underline: false },
      headingStyle: { bold: true, italic: false, underline: false },
      bodyStyle: { bold: false, italic: false, underline: false },
      contactStyle: { bold: false, italic: false, underline: false },
    },
  },
  atelier: {
    id: 'atelier',
    name: 'Atelier',
    description:
      'Editorial two-column CV with script name, terracotta accents, skill dots, and a ruler footer.',
    tone: 'accent',
    defaultShowPhoto: false,
    designDefaults: {
      fontFamily: 'garamond',
      nameFontFamily: 'great-vibes',
      titleFontFamily: 'lato',
      headingFontFamily: 'lato',
      contactFontFamily: 'lato',
      headerAlignment: 'left',
      headerPhotoLayout: 'photo-left',
      dividerStyle: 'none',
      density: 'normal',
      headingColor: '#C25B42',
      accentColor: '#C25B42',
      fontSize: 13,
      nameFontSize: 42,
      titleFontSize: 13,
      headingFontSize: 11,
      contactFontSize: 11,
      nameStyle: { bold: false, italic: false, underline: false },
      titleStyle: { bold: false, italic: false, underline: false },
      headingStyle: { bold: true, italic: false, underline: false },
      bodyStyle: { bold: false, italic: false, underline: false },
      contactStyle: { bold: false, italic: false, underline: false },
    },
  },
};

export function getAllResumeTemplates(): ResumeTemplateMeta[] {
  return Object.values(TEMPLATES);
}

export function getResumeTemplate(id: string | null | undefined): ResumeTemplateMeta {
  if (id && id in TEMPLATES) {
    return TEMPLATES[id as ResumeTemplateId];
  }
  return TEMPLATES[DEFAULT_RESUME_TEMPLATE_ID];
}

export function getResumeTemplateId(raw: unknown): ResumeTemplateId {
  if (typeof raw === 'string' && raw in TEMPLATES) {
    return raw as ResumeTemplateId;
  }
  return DEFAULT_RESUME_TEMPLATE_ID;
}

export function isValidResumeTemplateId(value: unknown): value is ResumeTemplateId {
  return typeof value === 'string' && value in TEMPLATES;
}

/** Accept a client-sent design only when `templateId` is a known resume template. */
export function sanitizeResumeDesign(raw: unknown): ResumeDesign | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const design = raw as ResumeDesign;
  if (!isValidResumeTemplateId(design.templateId)) return undefined;
  return design;
}

/** Whether this template’s default look includes a resume photo. */
export function getTemplateDefaultShowPhoto(
  templateId: ResumeTemplateId | string | null | undefined
): boolean {
  return getResumeTemplate(getResumeTemplateId(templateId)).defaultShowPhoto;
}

/**
 * Full design defaults for a template — used by "Restore Defaults".
 * Keeps the selected template; does not switch to the global classic defaults.
 * Callers should also sync `resumeShowPhoto` via `getTemplateDefaultShowPhoto`.
 */
export function buildDefaultDesignForTemplate(
  templateId: ResumeTemplateId | string | null | undefined
): Required<ResumeDesign> {
  const id = getResumeTemplateId(templateId);
  const meta = getResumeTemplate(id);
  return {
    ...RESUME_DESIGN_DEFAULTS,
    ...meta.designDefaults,
    templateId: id,
  };
}

/**
 * Build the next resumeDesign when switching templates.
 * Preserves user colors when they already differ from the previous template's
 * recommended accents; always sets templateId and applies typography/layout defaults.
 * Callers should also sync `resumeShowPhoto` via `getTemplateDefaultShowPhoto`.
 */
export function buildDesignForTemplateSwitch(
  current: ResumeDesign | null | undefined,
  nextTemplateId: ResumeTemplateId
): ResumeDesign {
  const nextMeta = getResumeTemplate(nextTemplateId);
  const prevId = getResumeTemplateId(current?.templateId);
  const prevMeta = getResumeTemplate(prevId);

  const preserved: ResumeDesign = { ...(current ?? {}) };

  // Preserve colors unless they still match the previous template's defaults
  // (or were never set) — then adopt the new template's recommended palette.
  const headingMatchesPrev =
    !current?.headingColor || current.headingColor === prevMeta.designDefaults.headingColor;
  const accentMatchesPrev =
    !current?.accentColor || current.accentColor === prevMeta.designDefaults.accentColor;

  return {
    ...preserved,
    ...nextMeta.designDefaults,
    templateId: nextTemplateId,
    // Always keep explicit user theme / justify / layout / sizes if set
    colorTheme: current?.colorTheme ?? nextMeta.designDefaults.colorTheme,
    fontSize: current?.fontSize ?? nextMeta.designDefaults.fontSize,
    nameFontSize: current?.nameFontSize ?? nextMeta.designDefaults.nameFontSize,
    titleFontSize: current?.titleFontSize ?? nextMeta.designDefaults.titleFontSize,
    headingFontSize: current?.headingFontSize ?? nextMeta.designDefaults.headingFontSize,
    contactFontSize: current?.contactFontSize ?? nextMeta.designDefaults.contactFontSize,
    justifyAll: current?.justifyAll ?? nextMeta.designDefaults.justifyAll,
    pageLayout: current?.pageLayout ?? nextMeta.designDefaults.pageLayout,
    headingColor: headingMatchesPrev
      ? (nextMeta.designDefaults.headingColor ?? current?.headingColor)
      : current!.headingColor,
    accentColor: accentMatchesPrev
      ? (nextMeta.designDefaults.accentColor ?? current?.accentColor)
      : current!.accentColor,
  };
}
