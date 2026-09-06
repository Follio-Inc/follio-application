/**
 * Shared document design → CSS custom properties (`--rd-*`).
 *
 * Resume and cover letter both render through these tokens so design
 * changes stay in one pipeline. Resume-specific fields (photo, title,
 * contact) are optional inputs with safe defaults.
 */

import type { CSSProperties } from 'react';

import {
  DOCUMENT_DESIGN_DEFAULTS,
  DOCUMENT_FONT_MAP,
  DOCUMENT_TEXT_STYLE_DEFAULTS,
  type DocumentDensity,
  type DocumentDesign,
  type DocumentDividerStyle,
  type DocumentFontFamily,
  type DocumentTextStyle,
} from './types';

/** Resolved font roles used by CSS vars and the font loader. */
export interface ResolvedDocumentFonts {
  body: DocumentFontFamily;
  name: DocumentFontFamily;
  title: DocumentFontFamily;
  heading: DocumentFontFamily;
  contact: DocumentFontFamily;
}

export interface ResolvedDocumentTextStyles {
  name: DocumentTextStyle;
  title: DocumentTextStyle;
  heading: DocumentTextStyle;
  body: DocumentTextStyle;
  contact: DocumentTextStyle;
}

/**
 * Fully resolved paper tokens ready for `--rd-*` emission.
 * Document types merge their defaults into this shape before calling
 * `buildDocumentDesignStyles`.
 */
export interface ResolvedDocumentPaperTokens {
  headingColor: string;
  accentColor: string;
  fonts: ResolvedDocumentFonts;
  textStyles: ResolvedDocumentTextStyles;
  fontSize: number;
  nameFontSize: number;
  titleFontSize: number;
  headingFontSize: number;
  contactFontSize: number;
  photoSize: number;
  headerAlignment: 'left' | 'center' | 'right';
  density: DocumentDensity;
  dividerStyle: DocumentDividerStyle;
  justifyAll: boolean;
}

export function mergeTextStyle(
  raw: DocumentTextStyle | undefined,
  fallback: DocumentTextStyle
): DocumentTextStyle {
  return {
    bold: raw?.bold ?? fallback.bold,
    italic: raw?.italic ?? fallback.italic,
    underline: raw?.underline ?? fallback.underline,
  };
}

function textStyleToCssVars(prefix: string, style: DocumentTextStyle): Record<string, string> {
  return {
    [`--rd-${prefix}-font-weight`]: style.bold ? '700' : '400',
    [`--rd-${prefix}-font-style`]: style.italic ? 'italic' : 'normal',
    [`--rd-${prefix}-text-decoration`]: style.underline ? 'underline' : 'none',
  };
}

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
export function getDarkModeColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#e5e5e5';
  const [r, g, b] = rgb;
  const lum = relativeLuminance(r, g, b);

  if (lum >= 0.4) return hex;

  const factor = lum < 0.1 ? 0.85 : lum < 0.25 ? 0.7 : 0.5;
  return `#${toHex(r + (255 - r) * factor)}${toHex(g + (255 - g) * factor)}${toHex(
    b + (255 - b) * factor
  )}`;
}

const DENSITY_SCALE: Record<DocumentDensity, number> = {
  compact: 0.75,
  normal: 1,
  relaxed: 1.35,
};

interface DividerStyles {
  height: string;
  background: string;
  borderTop: string;
  opacity: string | number;
}

function getDividerCSS(style: DocumentDividerStyle, accentColor: string): DividerStyles {
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

/**
 * Build a CSS custom-properties object (for React `style` prop) from
 * resolved paper tokens. Classes reference these via `var(--rd-*)`.
 */
export function buildDocumentDesignStyles(tokens: ResolvedDocumentPaperTokens): CSSProperties {
  const densityScale = DENSITY_SCALE[tokens.density];
  const divider = getDividerCSS(tokens.dividerStyle, tokens.accentColor);
  const dividerDark = getDividerCSS(tokens.dividerStyle, getDarkModeColor(tokens.accentColor));
  const { fonts, textStyles } = tokens;

  return {
    '--rd-heading-color': tokens.headingColor,
    '--rd-heading-color-dark': getDarkModeColor(tokens.headingColor),
    '--rd-accent-color': tokens.accentColor,
    '--rd-accent-color-dark': getDarkModeColor(tokens.accentColor),
    '--rd-font-family': DOCUMENT_FONT_MAP[fonts.body],
    '--rd-font-body': DOCUMENT_FONT_MAP[fonts.body],
    '--rd-font-name': DOCUMENT_FONT_MAP[fonts.name],
    '--rd-font-title': DOCUMENT_FONT_MAP[fonts.title],
    '--rd-font-heading': DOCUMENT_FONT_MAP[fonts.heading],
    '--rd-font-contact': DOCUMENT_FONT_MAP[fonts.contact],
    '--rd-font-size': `${tokens.fontSize}px`,
    '--rd-name-font-size': `${tokens.nameFontSize}px`,
    '--rd-title-font-size': `${tokens.titleFontSize}px`,
    '--rd-heading-font-size': `${tokens.headingFontSize}px`,
    '--rd-contact-font-size': `${tokens.contactFontSize}px`,
    '--rd-photo-size': `${tokens.photoSize}px`,
    ...textStyleToCssVars('name', textStyles.name),
    ...textStyleToCssVars('title', textStyles.title),
    ...textStyleToCssVars('heading', textStyles.heading),
    ...textStyleToCssVars('body', textStyles.body),
    ...textStyleToCssVars('contact', textStyles.contact),
    '--rd-header-alignment': tokens.headerAlignment,
    '--rd-section-gap': `${Math.round(20 * densityScale)}px`,
    '--rd-entry-gap': `${Math.round(16 * densityScale)}px`,
    '--rd-bullet-margin': `${Math.round(8 * densityScale)}px`,
    '--rd-header-margin-bottom': `${Math.round(24 * densityScale)}px`,
    '--rd-divider-height': divider.height,
    '--rd-divider-bg': divider.background,
    '--rd-divider-border': divider.borderTop,
    '--rd-divider-opacity': divider.opacity,
    '--rd-divider-bg-dark': dividerDark.background,
    '--rd-divider-border-dark': dividerDark.borderTop,
    '--rd-divider-border-bottom':
      tokens.dividerStyle === 'double' ? `1px solid ${tokens.accentColor}` : 'none',
    '--rd-divider-border-bottom-dark':
      tokens.dividerStyle === 'double'
        ? `1px solid ${getDarkModeColor(tokens.accentColor)}`
        : 'none',
  } as CSSProperties;
}

export function buildDocumentDesignStyleAttr(tokens: ResolvedDocumentPaperTokens): string {
  const styles = buildDocumentDesignStyles(tokens);
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('; ');
}

/** Parse design JSON from storage (handles string or object). */
export function parseDocumentDesign(raw: unknown): DocumentDesign | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as DocumentDesign;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as DocumentDesign;
  return null;
}

/** Pick shared DocumentDesign fields from a broader design object (e.g. resume). */
export function pickDocumentDesign(raw: DocumentDesign & Record<string, unknown>): DocumentDesign {
  return {
    colorTheme: raw.colorTheme,
    headingColor: raw.headingColor,
    accentColor: raw.accentColor,
    fontFamily: raw.fontFamily,
    nameFontFamily: raw.nameFontFamily,
    headingFontFamily: raw.headingFontFamily,
    dividerStyle: raw.dividerStyle,
    fontSize: raw.fontSize,
    density: raw.density,
    nameFontSize: raw.nameFontSize,
    headingFontSize: raw.headingFontSize,
    nameStyle: raw.nameStyle,
    headingStyle: raw.headingStyle,
    bodyStyle: raw.bodyStyle,
    justifyAll: raw.justifyAll,
    pageLayout: raw.pageLayout,
  };
}

export function defaultResolvedFonts(
  design: DocumentDesign | null | undefined
): ResolvedDocumentFonts {
  const body = design?.fontFamily ?? DOCUMENT_DESIGN_DEFAULTS.fontFamily;
  const heading = design?.headingFontFamily ?? DOCUMENT_DESIGN_DEFAULTS.headingFontFamily;
  const name = design?.nameFontFamily ?? body;
  return {
    body,
    name,
    heading,
    title: body,
    contact: heading,
  };
}

export function defaultResolvedTextStyles(
  design: DocumentDesign | null | undefined
): ResolvedDocumentTextStyles {
  return {
    name: mergeTextStyle(design?.nameStyle, DOCUMENT_DESIGN_DEFAULTS.nameStyle),
    title: DOCUMENT_TEXT_STYLE_DEFAULTS,
    heading: mergeTextStyle(design?.headingStyle, DOCUMENT_DESIGN_DEFAULTS.headingStyle),
    body: mergeTextStyle(design?.bodyStyle, DOCUMENT_DESIGN_DEFAULTS.bodyStyle),
    contact: DOCUMENT_TEXT_STYLE_DEFAULTS,
  };
}
