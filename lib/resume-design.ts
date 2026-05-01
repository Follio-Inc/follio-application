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
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
} from '@/types';

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
  const d: Required<ResumeDesign> = { ...RESUME_DESIGN_DEFAULTS, ...(raw ?? {}) };
  const densityScale = DENSITY_SCALE[d.density];
  const divider = getDividerCSS(d.dividerStyle, d.accentColor);
  const dividerDark = getDividerCSS(d.dividerStyle, getDarkModeColor(d.accentColor));

  return {
    /* Custom properties consumed by .resume-* classes */
    '--rd-heading-color': d.headingColor,
    '--rd-heading-color-dark': getDarkModeColor(d.headingColor),
    '--rd-accent-color': d.accentColor,
    '--rd-accent-color-dark': getDarkModeColor(d.accentColor),
    '--rd-font-family': RESUME_FONT_MAP[d.fontFamily],
    '--rd-font-size': `${d.fontSize}px`,
    '--rd-name-font-size': `${d.nameFontSize}px`,
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
