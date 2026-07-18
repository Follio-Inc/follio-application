/**
 * Resume template registry
 *
 * Content stays on Profile relations. Templates only change presentation via
 * `resumeDesign.templateId` (+ optional recommended design defaults on select).
 */

import { RESUME_DESIGN_DEFAULTS, type ResumeDesign } from '@/types';

import { type ResumeTemplateId, type ResumeTemplateMeta } from './types';

export const DEFAULT_RESUME_TEMPLATE_ID: ResumeTemplateId = 'classic';

const TEMPLATES: Record<ResumeTemplateId, ResumeTemplateMeta> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Single-column ATS-friendly layout. Clean, centered, timeless.',
    tone: 'plain',
    designDefaults: {
      fontFamily: 'georgia',
      nameFontFamily: 'georgia',
      titleFontFamily: 'georgia',
      headingFontFamily: 'system',
      contactFontFamily: 'system',
      headerAlignment: 'center',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#000000',
      accentColor: '#000000',
      titleFontSize: 15,
      headingFontSize: 12,
      contactFontSize: 12,
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
    designDefaults: {
      fontFamily: 'instrument-sans',
      nameFontFamily: 'instrument-sans',
      titleFontFamily: 'instrument-sans',
      headingFontFamily: 'instrument-sans',
      contactFontFamily: 'instrument-sans',
      headerAlignment: 'left',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#171717',
      accentColor: '#b0aaa3',
      nameFontSize: 30,
      titleFontSize: 13,
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
    designDefaults: {
      fontFamily: 'lato',
      nameFontFamily: 'lato',
      titleFontFamily: 'lato',
      headingFontFamily: 'system',
      contactFontFamily: 'system',
      headerAlignment: 'left',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#1f2d3d',
      accentColor: '#8f9aa8',
      titleFontSize: 14,
      headingFontSize: 11.5,
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
    designDefaults: {
      fontFamily: 'open-sans',
      nameFontFamily: 'open-sans',
      titleFontFamily: 'open-sans',
      headingFontFamily: 'system',
      contactFontFamily: 'open-sans',
      headerAlignment: 'left',
      dividerStyle: 'line',
      density: 'normal',
      headingColor: '#1a1a1a',
      accentColor: '#7a9aa5',
      titleFontSize: 13,
      headingFontSize: 13,
      contactFontSize: 12,
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
    designDefaults: {
      fontFamily: 'garamond',
      nameFontFamily: 'great-vibes',
      titleFontFamily: 'lato',
      headingFontFamily: 'lato',
      contactFontFamily: 'lato',
      headerAlignment: 'left',
      dividerStyle: 'none',
      density: 'normal',
      headingColor: '#C25B42',
      accentColor: '#C25B42',
      nameFontSize: 42,
      titleFontSize: 11,
      headingFontSize: 12,
      contactFontSize: 11.5,
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

/**
 * Full design defaults for a template — used by "Restore Defaults".
 * Keeps the selected template; does not switch to the global classic defaults.
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
    // Always keep explicit user theme / justify / sizes if set
    colorTheme: current?.colorTheme ?? nextMeta.designDefaults.colorTheme,
    fontSize: current?.fontSize ?? nextMeta.designDefaults.fontSize,
    nameFontSize: current?.nameFontSize ?? nextMeta.designDefaults.nameFontSize,
    titleFontSize: current?.titleFontSize ?? nextMeta.designDefaults.titleFontSize,
    headingFontSize: current?.headingFontSize ?? nextMeta.designDefaults.headingFontSize,
    contactFontSize: current?.contactFontSize ?? nextMeta.designDefaults.contactFontSize,
    justifyAll: current?.justifyAll ?? nextMeta.designDefaults.justifyAll,
    headingColor: headingMatchesPrev
      ? (nextMeta.designDefaults.headingColor ?? current?.headingColor)
      : current!.headingColor,
    accentColor: accentMatchesPrev
      ? (nextMeta.designDefaults.accentColor ?? current?.accentColor)
      : current!.accentColor,
  };
}
