/**
 * Shared validation for document design PATCH payloads.
 * Resume and cover letter APIs use this for the shared paper fields;
 * each document type validates its own extras (templateId, photo, …).
 */

import {
  DOCUMENT_FONT_OPTIONS,
  type DocumentColorTheme,
  type DocumentDensity,
  type DocumentDesign,
  type DocumentDividerStyle,
  type DocumentFontFamily,
  type DocumentPageLayout,
  type DocumentTextStyle,
} from './types';

const VALID_FONT_FAMILIES = new Set<DocumentFontFamily>(DOCUMENT_FONT_OPTIONS);

const VALID_DIVIDER_STYLES = new Set<DocumentDividerStyle>([
  'line',
  'double',
  'dotted',
  'dashed',
  'thick',
  'none',
]);

const VALID_DENSITIES = new Set<DocumentDensity>(['compact', 'normal', 'relaxed']);

const VALID_COLOR_THEMES = new Set<DocumentColorTheme>(['light', 'dark', 'system']);

const VALID_PAGE_LAYOUTS = new Set<DocumentPageLayout>(['continuous', 'a4', 'letter']);

/** Accept legacy `paged` on write and normalize to `letter`. */
const LEGACY_PAGE_LAYOUTS = new Set(['paged']);

export type DesignValidationResult =
  | { valid: true; data: DocumentDesign }
  | { valid: false; data: null; error: string };

/** Validates a CSS hex color string (3-, 4-, 6-, or 8-digit). */
export function isValidHexColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}

function validateFontField(
  raw: Record<string, unknown>,
  key: 'fontFamily' | 'nameFontFamily' | 'headingFontFamily',
  design: DocumentDesign
): { ok: true } | { ok: false; error: string } {
  if (raw[key] === undefined) return { ok: true };
  if (!VALID_FONT_FAMILIES.has(raw[key] as DocumentFontFamily)) {
    return {
      ok: false,
      error: `${key} must be one of: ${[...VALID_FONT_FAMILIES].join(', ')}`,
    };
  }
  design[key] = raw[key] as DocumentFontFamily;
  return { ok: true };
}

function validateTextStyleField(
  raw: Record<string, unknown>,
  key: 'nameStyle' | 'headingStyle' | 'bodyStyle',
  design: DocumentDesign
): { ok: true } | { ok: false; error: string } {
  if (raw[key] === undefined) return { ok: true };
  const value = raw[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: `${key} must be an object with bold, italic, underline booleans`,
    };
  }
  const style = value as Record<string, unknown>;
  for (const flag of ['bold', 'italic', 'underline'] as const) {
    if (style[flag] !== undefined && typeof style[flag] !== 'boolean') {
      return { ok: false, error: `${key}.${flag} must be a boolean` };
    }
  }
  design[key] = {
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    underline: Boolean(style.underline),
  } satisfies DocumentTextStyle;
  return { ok: true };
}

/**
 * Validate and extract shared DocumentDesign fields from a request body.
 * Unknown / document-specific fields are ignored here.
 */
export function validateDocumentDesign(body: unknown): DesignValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, data: null, error: 'Request body must be an object' };
  }

  const raw = body as Record<string, unknown>;
  const design: DocumentDesign = {};

  if (raw.colorTheme !== undefined) {
    if (!VALID_COLOR_THEMES.has(raw.colorTheme as DocumentColorTheme)) {
      return {
        valid: false,
        data: null,
        error: `colorTheme must be one of: ${[...VALID_COLOR_THEMES].join(', ')}`,
      };
    }
    design.colorTheme = raw.colorTheme as DocumentColorTheme;
  }

  if (raw.headingColor !== undefined) {
    if (!isValidHexColor(raw.headingColor)) {
      return { valid: false, data: null, error: 'headingColor must be a valid hex color' };
    }
    design.headingColor = raw.headingColor;
  }

  if (raw.accentColor !== undefined) {
    if (!isValidHexColor(raw.accentColor)) {
      return { valid: false, data: null, error: 'accentColor must be a valid hex color' };
    }
    design.accentColor = raw.accentColor;
  }

  for (const key of ['fontFamily', 'nameFontFamily', 'headingFontFamily'] as const) {
    const result = validateFontField(raw, key, design);
    if (!result.ok) return { valid: false, data: null, error: result.error };
  }

  if (raw.dividerStyle !== undefined) {
    if (!VALID_DIVIDER_STYLES.has(raw.dividerStyle as DocumentDividerStyle)) {
      return {
        valid: false,
        data: null,
        error: `dividerStyle must be one of: ${[...VALID_DIVIDER_STYLES].join(', ')}`,
      };
    }
    design.dividerStyle = raw.dividerStyle as DocumentDividerStyle;
  }

  if (raw.density !== undefined) {
    if (!VALID_DENSITIES.has(raw.density as DocumentDensity)) {
      return {
        valid: false,
        data: null,
        error: `density must be one of: ${[...VALID_DENSITIES].join(', ')}`,
      };
    }
    design.density = raw.density as DocumentDensity;
  }

  if (raw.fontSize !== undefined) {
    const size = Number(raw.fontSize);
    if (isNaN(size) || size < 8 || size > 20) {
      return { valid: false, data: null, error: 'fontSize must be a number between 8 and 20' };
    }
    design.fontSize = size;
  }

  if (raw.nameFontSize !== undefined) {
    const size = Number(raw.nameFontSize);
    if (isNaN(size) || size < 16 || size > 48) {
      return { valid: false, data: null, error: 'nameFontSize must be a number between 16 and 48' };
    }
    design.nameFontSize = size;
  }

  if (raw.headingFontSize !== undefined) {
    const size = Number(raw.headingFontSize);
    if (isNaN(size) || size < 9 || size > 18) {
      return {
        valid: false,
        data: null,
        error: 'headingFontSize must be a number between 9 and 18',
      };
    }
    design.headingFontSize = size;
  }

  for (const key of ['nameStyle', 'headingStyle', 'bodyStyle'] as const) {
    const result = validateTextStyleField(raw, key, design);
    if (!result.ok) return { valid: false, data: null, error: result.error };
  }

  if (raw.justifyAll !== undefined) {
    if (typeof raw.justifyAll !== 'boolean') {
      return { valid: false, data: null, error: 'justifyAll must be a boolean' };
    }
    design.justifyAll = raw.justifyAll;
  }

  if (raw.pageLayout !== undefined) {
    if (LEGACY_PAGE_LAYOUTS.has(raw.pageLayout as string)) {
      design.pageLayout = 'letter';
    } else if (!VALID_PAGE_LAYOUTS.has(raw.pageLayout as DocumentPageLayout)) {
      return {
        valid: false,
        data: null,
        error: `pageLayout must be one of: ${[...VALID_PAGE_LAYOUTS].join(', ')}`,
      };
    } else {
      design.pageLayout = raw.pageLayout as DocumentPageLayout;
    }
  }

  return { valid: true, data: design };
}

export { VALID_FONT_FAMILIES, VALID_COLOR_THEMES, VALID_PAGE_LAYOUTS, LEGACY_PAGE_LAYOUTS };
