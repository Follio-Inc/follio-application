/**
 * Resume Design Utilities
 *
 * Converts the ResumeDesign settings into CSS custom properties and inline
 * styles that the resume CSS classes consume. This keeps the design logic
 * centralised and shared between the builder preview and the public view.
 */

import {
  RESUME_DESIGN_DEFAULTS,
  RESUME_FONT_MAP,
  RESUME_TEXT_STYLE_DEFAULTS,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeTextStyle,
} from '@/types';
import { getResumeTemplate, getResumeTemplateId } from '@/lib/resume/templates';

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

function mergeTextStyle(
  raw: ResumeTextStyle | undefined,
  fallback: ResumeTextStyle
): ResumeTextStyle {
  return {
    bold: raw?.bold ?? fallback.bold,
    italic: raw?.italic ?? fallback.italic,
    underline: raw?.underline ?? fallback.underline,
  };
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
  const body = raw?.fontFamily ?? RESUME_DESIGN_DEFAULTS.fontFamily;
  const isAtelier = raw?.templateId === 'atelier';
  const heading = raw?.headingFontFamily ?? getTemplateDefaultFont(raw?.templateId, 'heading');
  const name = raw?.nameFontFamily ?? (isAtelier ? 'great-vibes' : body);
  return {
    body,
    name,
    heading,
    title: raw?.titleFontFamily ?? (isAtelier ? heading : body),
    contact: raw?.contactFontFamily ?? getTemplateDefaultFont(raw?.templateId, 'contact'),
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

function textStyleToCssVars(prefix: string, style: ResumeTextStyle): Record<string, string> {
  return {
    [`--rd-${prefix}-font-weight`]: style.bold ? '700' : '400',
    [`--rd-${prefix}-font-style`]: style.italic ? 'italic' : 'normal',
    [`--rd-${prefix}-text-decoration`]: style.underline ? 'underline' : 'none',
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
    // Prefer explicit sizes; otherwise use the active template’s recommended sizes
    // so Studio/Sleek/Atelier/Lumen don’t jump when sizes were never stored.
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

// ─── Dark Mode Color Helpers ──────────────────────────────────────

/** Parse a hex color (3 or 6 chars, with optional #) to RGB tuple. */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/** Relative luminance per WCAG 2.0 (0 = black, 1 = white). */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function toHex(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Compute a readable dark-mode variant for a color.
 * Dark colors are lightened (preserving hue); already-bright colors pass through.
 */
function getDarkModeColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#e5e5e5'; // safe fallback
  const [r, g, b] = rgb;
  const lum = relativeLuminance(r, g, b);

  if (lum >= 0.4) return hex; // already light enough for dark background

  // Lighten towards white — stronger shift for darker colors
  const factor = lum < 0.1 ? 0.85 : lum < 0.25 ? 0.7 : 0.5;
  return `#${toHex(r + (255 - r) * factor)}${toHex(g + (255 - g) * factor)}${toHex(b + (255 - b) * factor)}`;
}

// ─── Density Multipliers ──────────────────────────────────────────

const DENSITY_SCALE: Record<ResumeDensity, number> = {
  compact: 0.75,
  normal: 1,
  relaxed: 1.35,
};

// ─── Divider CSS ──────────────────────────────────────────────────

interface DividerStyles {
  height: string;
  background: string;
  borderTop: string;
  opacity: string | number;
}

function getDividerCSS(style: ResumeDividerStyle, accentColor: string): DividerStyles {
  const transparent = 'transparent';

  switch (style) {
    case 'line':
      return { height: '1px', background: accentColor, borderTop: 'none', opacity: 0.2 };
    case 'double':
      return {
        height: '4px',
        background: transparent,
        borderTop: `1px solid ${accentColor}`,
        opacity: 0.25,
      };
    case 'thick':
      return { height: '2.5px', background: accentColor, borderTop: 'none', opacity: 0.25 };
    case 'dashed':
      return {
        height: '0',
        background: transparent,
        borderTop: `1.5px dashed ${accentColor}`,
        opacity: 0.3,
      };
    case 'dotted':
      return {
        height: '0',
        background: transparent,
        borderTop: `1.5px dotted ${accentColor}`,
        opacity: 0.3,
      };
    case 'none':
      return { height: '0', background: transparent, borderTop: 'none', opacity: 0 };
    default:
      return { height: '1px', background: accentColor, borderTop: 'none', opacity: 0.2 };
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Build a CSS custom-properties object (for React `style` prop) from the
 * given ResumeDesign settings. Missing values fall back to defaults.
 *
 * The resume CSS classes reference these via `var(--rd-*)`.
 */
export function buildResumeDesignStyles(raw: ResumeDesign | null | undefined): React.CSSProperties {
  const d = mergeResumeDesign(raw);
  const fonts = resolveResumeFonts(raw);
  const textStyles = resolveResumeTextStyles(raw);
  const densityScale = DENSITY_SCALE[d.density];
  const divider = getDividerCSS(d.dividerStyle, d.accentColor);
  const dividerDark = getDividerCSS(d.dividerStyle, getDarkModeColor(d.accentColor));

  return {
    /* Custom properties consumed by .resume-* classes */
    '--rd-heading-color': d.headingColor,
    '--rd-heading-color-dark': getDarkModeColor(d.headingColor),
    '--rd-accent-color': d.accentColor,
    '--rd-accent-color-dark': getDarkModeColor(d.accentColor),
    '--rd-font-family': RESUME_FONT_MAP[fonts.body],
    '--rd-font-body': RESUME_FONT_MAP[fonts.body],
    '--rd-font-name': RESUME_FONT_MAP[fonts.name],
    '--rd-font-title': RESUME_FONT_MAP[fonts.title],
    '--rd-font-heading': RESUME_FONT_MAP[fonts.heading],
    '--rd-font-contact': RESUME_FONT_MAP[fonts.contact],
    '--rd-font-size': `${d.fontSize}px`,
    '--rd-name-font-size': `${d.nameFontSize}px`,
    '--rd-title-font-size': `${d.titleFontSize}px`,
    '--rd-heading-font-size': `${d.headingFontSize}px`,
    '--rd-contact-font-size': `${d.contactFontSize}px`,
    ...textStyleToCssVars('name', textStyles.name),
    ...textStyleToCssVars('title', textStyles.title),
    ...textStyleToCssVars('heading', textStyles.heading),
    ...textStyleToCssVars('body', textStyles.body),
    ...textStyleToCssVars('contact', textStyles.contact),
    '--rd-header-alignment': d.headerAlignment,
    '--rd-justify-all': d.justifyAll ? 'justify' : 'initial',
    '--rd-section-gap': `${Math.round(20 * densityScale)}px`,
    '--rd-entry-gap': `${Math.round(16 * densityScale)}px`,
    '--rd-bullet-margin': `${Math.round(8 * densityScale)}px`,
    '--rd-header-margin-bottom': `${Math.round(24 * densityScale)}px`,
    /* Divider (light mode) */
    '--rd-divider-height': divider.height,
    '--rd-divider-bg': divider.background,
    '--rd-divider-border': divider.borderTop,
    '--rd-divider-opacity': divider.opacity,
    /* Divider (dark mode variants) */
    '--rd-divider-bg-dark': dividerDark.background,
    '--rd-divider-border-dark': dividerDark.borderTop,
    /* Double-line needs border-bottom too */
    '--rd-divider-border-bottom':
      d.dividerStyle === 'double' ? `1px solid ${d.accentColor}` : 'none',
    '--rd-divider-border-bottom-dark':
      d.dividerStyle === 'double' ? `1px solid ${getDarkModeColor(d.accentColor)}` : 'none',
  } as React.CSSProperties;
}

/**
 * Build a CSS `style` attribute string with all `--rd-*` custom properties.
 * Used by PDF export where inline styles are required.
 */
export function buildResumeDesignStyleAttr(raw: ResumeDesign | null | undefined): string {
  const styles = buildResumeDesignStyles(raw);
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ');
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
