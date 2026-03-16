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

  return {
    /* Custom properties consumed by .resume-* classes */
    '--rd-heading-color': d.headingColor,
    '--rd-accent-color': d.accentColor,
    '--rd-font-family': RESUME_FONT_MAP[d.fontFamily],
    '--rd-font-size': `${d.fontSize}px`,
    '--rd-name-font-size': `${d.nameFontSize}px`,
    '--rd-header-alignment': d.headerAlignment,
    '--rd-section-gap': `${Math.round(20 * densityScale)}px`,
    '--rd-entry-gap': `${Math.round(16 * densityScale)}px`,
    '--rd-bullet-margin': `${Math.round(8 * densityScale)}px`,
    '--rd-header-margin-bottom': `${Math.round(24 * densityScale)}px`,
    /* Divider */
    '--rd-divider-height': divider.height,
    '--rd-divider-bg': divider.background,
    '--rd-divider-border': divider.borderTop,
    '--rd-divider-opacity': divider.opacity,
    /* Double-line needs border-bottom too */
    '--rd-divider-border-bottom':
      d.dividerStyle === 'double' ? `1px solid ${d.accentColor}` : 'none',
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
