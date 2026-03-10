/**
 * Portfolio Theme System
 *
 * Defines the complete style vocabulary for generated portfolios.
 * Each theme is a set of CSS custom properties applied via a data attribute.
 * The renderer applies `data-portfolio-theme="<theme>"` and the CSS activates.
 *
 * Design system:
 * - 15 color themes (each has bg, fg, primary, accent, muted, card, border)
 * - 4 type scales (editorial, technical, compact, spacious)
 * - 3 animation levels (none, subtle, moderate)
 * - 3 content densities (airy, balanced, dense)
 *
 * All themes include both light/dark mode support. The portfolio inherits
 * the user's system preference by default.
 */

import type {
  AnimationLevel,
  ColorTheme,
  ContentDensity,
  PortfolioStyle,
  TypeScale,
} from '@/types/portfolio';

// ============================================================================
// COLOR THEMES — HSL values (without 'hsl()' wrapper, Tailwind convention)
// ============================================================================

export interface ThemeTokens {
  /** Page background */
  background: string;
  /** Default text color */
  foreground: string;
  /** Primary brand/accent */
  primary: string;
  primaryForeground: string;
  /** Secondary accent */
  secondary: string;
  secondaryForeground: string;
  /** Muted / subdued elements */
  muted: string;
  mutedForeground: string;
  /** Card / elevated surfaces */
  card: string;
  cardForeground: string;
  /** Borders */
  border: string;
  /** Accent (for highlights, links, badges) */
  accent: string;
  accentForeground: string;
  /** Focus ring */
  ring: string;
}

interface ThemeDefinition {
  light: ThemeTokens;
  dark: ThemeTokens;
}

/**
 * All 15 color themes. Each provides light + dark mode tokens.
 * Values are HSL triplets: "H S% L%" (Tailwind's convention for hsl()).
 */
export const COLOR_THEMES: Record<ColorTheme, ThemeDefinition> = {
  'slate-professional': {
    light: {
      background: '210 20% 98%',
      foreground: '222 47% 11%',
      primary: '215 28% 17%',
      primaryForeground: '210 40% 98%',
      secondary: '210 40% 96%',
      secondaryForeground: '222 47% 11%',
      muted: '210 40% 96%',
      mutedForeground: '215 16% 47%',
      card: '0 0% 100%',
      cardForeground: '222 47% 11%',
      border: '214 32% 91%',
      accent: '213 94% 68%',
      accentForeground: '222 47% 11%',
      ring: '215 28% 17%',
    },
    dark: {
      background: '222 47% 11%',
      foreground: '210 40% 98%',
      primary: '210 40% 98%',
      primaryForeground: '222 47% 11%',
      secondary: '217 33% 17%',
      secondaryForeground: '210 40% 98%',
      muted: '217 33% 17%',
      mutedForeground: '215 20% 65%',
      card: '217 33% 14%',
      cardForeground: '210 40% 98%',
      border: '217 33% 20%',
      accent: '213 94% 68%',
      accentForeground: '210 40% 98%',
      ring: '210 40% 98%',
    },
  },

  'warm-earth': {
    light: {
      background: '40 33% 97%',
      foreground: '20 14% 12%',
      primary: '25 75% 47%',
      primaryForeground: '40 33% 97%',
      secondary: '35 30% 93%',
      secondaryForeground: '20 14% 12%',
      muted: '35 20% 94%',
      mutedForeground: '20 10% 45%',
      card: '40 33% 99%',
      cardForeground: '20 14% 12%',
      border: '30 15% 88%',
      accent: '15 80% 55%',
      accentForeground: '40 33% 97%',
      ring: '25 75% 47%',
    },
    dark: {
      background: '20 14% 8%',
      foreground: '40 20% 92%',
      primary: '25 80% 60%',
      primaryForeground: '20 14% 8%',
      secondary: '20 15% 15%',
      secondaryForeground: '40 20% 92%',
      muted: '20 10% 16%',
      mutedForeground: '30 12% 58%',
      card: '20 14% 11%',
      cardForeground: '40 20% 92%',
      border: '20 10% 20%',
      accent: '15 80% 60%',
      accentForeground: '40 20% 92%',
      ring: '25 80% 60%',
    },
  },

  'cool-ocean': {
    light: {
      background: '200 30% 98%',
      foreground: '205 47% 10%',
      primary: '200 80% 50%',
      primaryForeground: '0 0% 100%',
      secondary: '200 30% 94%',
      secondaryForeground: '205 47% 10%',
      muted: '200 20% 95%',
      mutedForeground: '200 10% 44%',
      card: '0 0% 100%',
      cardForeground: '205 47% 10%',
      border: '200 20% 90%',
      accent: '190 90% 45%',
      accentForeground: '0 0% 100%',
      ring: '200 80% 50%',
    },
    dark: {
      background: '205 47% 7%',
      foreground: '200 20% 95%',
      primary: '200 80% 60%',
      primaryForeground: '205 47% 7%',
      secondary: '200 30% 14%',
      secondaryForeground: '200 20% 95%',
      muted: '200 20% 15%',
      mutedForeground: '200 15% 60%',
      card: '205 40% 10%',
      cardForeground: '200 20% 95%',
      border: '200 20% 18%',
      accent: '190 90% 50%',
      accentForeground: '200 20% 95%',
      ring: '200 80% 60%',
    },
  },

  'deep-night': {
    light: {
      background: '240 20% 98%',
      foreground: '240 10% 10%',
      primary: '250 60% 50%',
      primaryForeground: '0 0% 100%',
      secondary: '240 20% 94%',
      secondaryForeground: '240 10% 10%',
      muted: '240 12% 95%',
      mutedForeground: '240 6% 45%',
      card: '0 0% 100%',
      cardForeground: '240 10% 10%',
      border: '240 10% 90%',
      accent: '270 70% 60%',
      accentForeground: '0 0% 100%',
      ring: '250 60% 50%',
    },
    dark: {
      background: '240 15% 6%',
      foreground: '240 10% 95%',
      primary: '250 70% 65%',
      primaryForeground: '240 15% 6%',
      secondary: '240 12% 13%',
      secondaryForeground: '240 10% 95%',
      muted: '240 10% 14%',
      mutedForeground: '240 8% 60%',
      card: '240 12% 9%',
      cardForeground: '240 10% 95%',
      border: '240 10% 17%',
      accent: '270 70% 65%',
      accentForeground: '240 10% 95%',
      ring: '250 70% 65%',
    },
  },

  'clean-minimal': {
    light: {
      background: '0 0% 100%',
      foreground: '0 0% 9%',
      primary: '0 0% 9%',
      primaryForeground: '0 0% 100%',
      secondary: '0 0% 96%',
      secondaryForeground: '0 0% 9%',
      muted: '0 0% 96%',
      mutedForeground: '0 0% 45%',
      card: '0 0% 100%',
      cardForeground: '0 0% 9%',
      border: '0 0% 90%',
      accent: '0 0% 30%',
      accentForeground: '0 0% 100%',
      ring: '0 0% 9%',
    },
    dark: {
      background: '0 0% 4%',
      foreground: '0 0% 95%',
      primary: '0 0% 95%',
      primaryForeground: '0 0% 4%',
      secondary: '0 0% 12%',
      secondaryForeground: '0 0% 95%',
      muted: '0 0% 12%',
      mutedForeground: '0 0% 60%',
      card: '0 0% 7%',
      cardForeground: '0 0% 95%',
      border: '0 0% 16%',
      accent: '0 0% 70%',
      accentForeground: '0 0% 4%',
      ring: '0 0% 95%',
    },
  },

  'bold-contrast': {
    light: {
      background: '0 0% 100%',
      foreground: '0 0% 4%',
      primary: '0 0% 0%',
      primaryForeground: '0 0% 100%',
      secondary: '50 100% 50%',
      secondaryForeground: '0 0% 4%',
      muted: '0 0% 96%',
      mutedForeground: '0 0% 40%',
      card: '0 0% 100%',
      cardForeground: '0 0% 4%',
      border: '0 0% 88%',
      accent: '50 100% 50%',
      accentForeground: '0 0% 4%',
      ring: '0 0% 0%',
    },
    dark: {
      background: '0 0% 2%',
      foreground: '0 0% 98%',
      primary: '0 0% 100%',
      primaryForeground: '0 0% 2%',
      secondary: '50 100% 50%',
      secondaryForeground: '0 0% 2%',
      muted: '0 0% 12%',
      mutedForeground: '0 0% 65%',
      card: '0 0% 6%',
      cardForeground: '0 0% 98%',
      border: '0 0% 15%',
      accent: '50 100% 50%',
      accentForeground: '0 0% 2%',
      ring: '0 0% 100%',
    },
  },

  'soft-sage': {
    light: {
      background: '140 20% 97%',
      foreground: '150 20% 12%',
      primary: '155 40% 42%',
      primaryForeground: '0 0% 100%',
      secondary: '145 25% 93%',
      secondaryForeground: '150 20% 12%',
      muted: '145 15% 94%',
      mutedForeground: '150 8% 46%',
      card: '140 15% 99%',
      cardForeground: '150 20% 12%',
      border: '145 12% 89%',
      accent: '160 50% 45%',
      accentForeground: '0 0% 100%',
      ring: '155 40% 42%',
    },
    dark: {
      background: '150 20% 7%',
      foreground: '140 15% 93%',
      primary: '155 45% 55%',
      primaryForeground: '150 20% 7%',
      secondary: '150 15% 14%',
      secondaryForeground: '140 15% 93%',
      muted: '150 12% 15%',
      mutedForeground: '145 10% 58%',
      card: '150 18% 10%',
      cardForeground: '140 15% 93%',
      border: '150 12% 19%',
      accent: '160 50% 50%',
      accentForeground: '140 15% 93%',
      ring: '155 45% 55%',
    },
  },

  'rich-plum': {
    light: {
      background: '280 15% 97%',
      foreground: '280 30% 12%',
      primary: '285 50% 45%',
      primaryForeground: '0 0% 100%',
      secondary: '280 20% 94%',
      secondaryForeground: '280 30% 12%',
      muted: '280 12% 95%',
      mutedForeground: '280 10% 46%',
      card: '280 10% 99%',
      cardForeground: '280 30% 12%',
      border: '280 10% 89%',
      accent: '310 55% 50%',
      accentForeground: '0 0% 100%',
      ring: '285 50% 45%',
    },
    dark: {
      background: '280 20% 6%',
      foreground: '280 10% 93%',
      primary: '285 55% 60%',
      primaryForeground: '280 20% 6%',
      secondary: '280 15% 13%',
      secondaryForeground: '280 10% 93%',
      muted: '280 12% 14%',
      mutedForeground: '280 8% 58%',
      card: '280 18% 9%',
      cardForeground: '280 10% 93%',
      border: '280 12% 18%',
      accent: '310 55% 55%',
      accentForeground: '280 10% 93%',
      ring: '285 55% 60%',
    },
  },

  'sunset-warm': {
    light: {
      background: '30 40% 97%',
      foreground: '15 30% 12%',
      primary: '20 85% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '25 35% 93%',
      secondaryForeground: '15 30% 12%',
      muted: '25 20% 94%',
      mutedForeground: '15 12% 45%',
      card: '30 30% 99%',
      cardForeground: '15 30% 12%',
      border: '25 15% 88%',
      accent: '355 75% 55%',
      accentForeground: '0 0% 100%',
      ring: '20 85% 55%',
    },
    dark: {
      background: '15 25% 7%',
      foreground: '30 25% 93%',
      primary: '20 85% 60%',
      primaryForeground: '15 25% 7%',
      secondary: '15 18% 14%',
      secondaryForeground: '30 25% 93%',
      muted: '15 14% 15%',
      mutedForeground: '20 10% 58%',
      card: '15 22% 10%',
      cardForeground: '30 25% 93%',
      border: '15 14% 19%',
      accent: '355 75% 60%',
      accentForeground: '30 25% 93%',
      ring: '20 85% 60%',
    },
  },

  'arctic-frost': {
    light: {
      background: '210 40% 98%',
      foreground: '215 30% 14%',
      primary: '210 60% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '210 30% 95%',
      secondaryForeground: '215 30% 14%',
      muted: '210 20% 96%',
      mutedForeground: '210 10% 45%',
      card: '210 30% 99%',
      cardForeground: '215 30% 14%',
      border: '210 15% 91%',
      accent: '195 80% 50%',
      accentForeground: '0 0% 100%',
      ring: '210 60% 55%',
    },
    dark: {
      background: '215 30% 7%',
      foreground: '210 25% 94%',
      primary: '210 65% 62%',
      primaryForeground: '215 30% 7%',
      secondary: '215 20% 14%',
      secondaryForeground: '210 25% 94%',
      muted: '215 15% 15%',
      mutedForeground: '210 12% 58%',
      card: '215 25% 10%',
      cardForeground: '210 25% 94%',
      border: '215 15% 19%',
      accent: '195 80% 55%',
      accentForeground: '210 25% 94%',
      ring: '210 65% 62%',
    },
  },

  'forest-green': {
    light: {
      background: '130 15% 97%',
      foreground: '140 30% 10%',
      primary: '145 55% 38%',
      primaryForeground: '0 0% 100%',
      secondary: '135 20% 93%',
      secondaryForeground: '140 30% 10%',
      muted: '135 12% 94%',
      mutedForeground: '140 10% 44%',
      card: '130 12% 99%',
      cardForeground: '140 30% 10%',
      border: '135 10% 88%',
      accent: '155 60% 42%',
      accentForeground: '0 0% 100%',
      ring: '145 55% 38%',
    },
    dark: {
      background: '140 25% 6%',
      foreground: '130 12% 93%',
      primary: '145 55% 48%',
      primaryForeground: '140 25% 6%',
      secondary: '140 18% 13%',
      secondaryForeground: '130 12% 93%',
      muted: '140 14% 14%',
      mutedForeground: '135 8% 55%',
      card: '140 22% 9%',
      cardForeground: '130 12% 93%',
      border: '140 14% 18%',
      accent: '155 60% 48%',
      accentForeground: '130 12% 93%',
      ring: '145 55% 48%',
    },
  },

  'coral-energy': {
    light: {
      background: '10 30% 98%',
      foreground: '0 20% 12%',
      primary: '5 80% 60%',
      primaryForeground: '0 0% 100%',
      secondary: '10 25% 94%',
      secondaryForeground: '0 20% 12%',
      muted: '10 15% 95%',
      mutedForeground: '0 8% 45%',
      card: '10 20% 99%',
      cardForeground: '0 20% 12%',
      border: '10 12% 89%',
      accent: '350 85% 55%',
      accentForeground: '0 0% 100%',
      ring: '5 80% 60%',
    },
    dark: {
      background: '0 18% 7%',
      foreground: '10 15% 93%',
      primary: '5 80% 65%',
      primaryForeground: '0 18% 7%',
      secondary: '0 14% 14%',
      secondaryForeground: '10 15% 93%',
      muted: '0 10% 15%',
      mutedForeground: '5 8% 58%',
      card: '0 16% 10%',
      cardForeground: '10 15% 93%',
      border: '0 10% 19%',
      accent: '350 85% 60%',
      accentForeground: '10 15% 93%',
      ring: '5 80% 65%',
    },
  },

  'indigo-depth': {
    light: {
      background: '230 20% 98%',
      foreground: '240 25% 12%',
      primary: '235 70% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '230 22% 94%',
      secondaryForeground: '240 25% 12%',
      muted: '230 14% 95%',
      mutedForeground: '235 10% 45%',
      card: '230 15% 99%',
      cardForeground: '240 25% 12%',
      border: '230 12% 89%',
      accent: '260 65% 60%',
      accentForeground: '0 0% 100%',
      ring: '235 70% 55%',
    },
    dark: {
      background: '240 22% 6%',
      foreground: '230 15% 93%',
      primary: '235 75% 65%',
      primaryForeground: '240 22% 6%',
      secondary: '240 16% 14%',
      secondaryForeground: '230 15% 93%',
      muted: '240 12% 15%',
      mutedForeground: '235 8% 58%',
      card: '240 20% 9%',
      cardForeground: '230 15% 93%',
      border: '240 12% 18%',
      accent: '260 65% 65%',
      accentForeground: '230 15% 93%',
      ring: '235 75% 65%',
    },
  },

  'sand-neutral': {
    light: {
      background: '40 20% 97%',
      foreground: '30 15% 14%',
      primary: '35 30% 40%',
      primaryForeground: '40 20% 97%',
      secondary: '38 18% 93%',
      secondaryForeground: '30 15% 14%',
      muted: '38 12% 94%',
      mutedForeground: '30 8% 46%',
      card: '40 15% 99%',
      cardForeground: '30 15% 14%',
      border: '38 10% 88%',
      accent: '30 40% 50%',
      accentForeground: '0 0% 100%',
      ring: '35 30% 40%',
    },
    dark: {
      background: '30 12% 7%',
      foreground: '40 15% 92%',
      primary: '35 35% 55%',
      primaryForeground: '30 12% 7%',
      secondary: '30 10% 14%',
      secondaryForeground: '40 15% 92%',
      muted: '30 8% 15%',
      mutedForeground: '35 6% 55%',
      card: '30 10% 10%',
      cardForeground: '40 15% 92%',
      border: '30 8% 18%',
      accent: '30 40% 55%',
      accentForeground: '40 15% 92%',
      ring: '35 35% 55%',
    },
  },

  'rose-elegant': {
    light: {
      background: '340 15% 98%',
      foreground: '345 20% 12%',
      primary: '340 65% 50%',
      primaryForeground: '0 0% 100%',
      secondary: '340 20% 94%',
      secondaryForeground: '345 20% 12%',
      muted: '340 12% 95%',
      mutedForeground: '340 8% 46%',
      card: '340 12% 99%',
      cardForeground: '345 20% 12%',
      border: '340 10% 89%',
      accent: '325 60% 55%',
      accentForeground: '0 0% 100%',
      ring: '340 65% 50%',
    },
    dark: {
      background: '345 18% 6%',
      foreground: '340 12% 93%',
      primary: '340 65% 60%',
      primaryForeground: '345 18% 6%',
      secondary: '345 14% 13%',
      secondaryForeground: '340 12% 93%',
      muted: '345 10% 14%',
      mutedForeground: '340 6% 56%',
      card: '345 16% 9%',
      cardForeground: '340 12% 93%',
      border: '345 10% 18%',
      accent: '325 60% 60%',
      accentForeground: '340 12% 93%',
      ring: '340 65% 60%',
    },
  },
};

// ============================================================================
// TYPE SCALE
// ============================================================================

export interface TypeScaleTokens {
  /** Hero headline size (rem) */
  heroSize: string;
  /** Section heading size (rem) */
  h2Size: string;
  /** Sub-heading size (rem) */
  h3Size: string;
  /** Body text size (rem) */
  bodySize: string;
  /** Small text / caption size (rem) */
  smallSize: string;
  /** Line height for body */
  bodyLineHeight: string;
  /** Line height for headings */
  headingLineHeight: string;
  /** Letter spacing for headings */
  headingLetterSpacing: string;
  /** Font weight for headings */
  headingWeight: string;
  /** Font weight for body */
  bodyWeight: string;
}

export const TYPE_SCALES: Record<TypeScale, TypeScaleTokens> = {
  editorial: {
    heroSize: '4rem',
    h2Size: '2.25rem',
    h3Size: '1.5rem',
    bodySize: '1.125rem',
    smallSize: '0.875rem',
    bodyLineHeight: '1.8',
    headingLineHeight: '1.15',
    headingLetterSpacing: '-0.02em',
    headingWeight: '700',
    bodyWeight: '400',
  },
  technical: {
    heroSize: '3rem',
    h2Size: '1.875rem',
    h3Size: '1.25rem',
    bodySize: '1rem',
    smallSize: '0.8125rem',
    bodyLineHeight: '1.65',
    headingLineHeight: '1.25',
    headingLetterSpacing: '-0.01em',
    headingWeight: '600',
    bodyWeight: '400',
  },
  compact: {
    heroSize: '2.5rem',
    h2Size: '1.5rem',
    h3Size: '1.125rem',
    bodySize: '0.9375rem',
    smallSize: '0.8125rem',
    bodyLineHeight: '1.55',
    headingLineHeight: '1.3',
    headingLetterSpacing: '0em',
    headingWeight: '600',
    bodyWeight: '400',
  },
  spacious: {
    heroSize: '4.5rem',
    h2Size: '2.5rem',
    h3Size: '1.625rem',
    bodySize: '1.125rem',
    smallSize: '0.875rem',
    bodyLineHeight: '1.9',
    headingLineHeight: '1.1',
    headingLetterSpacing: '-0.03em',
    headingWeight: '800',
    bodyWeight: '400',
  },
};

// ============================================================================
// CONTENT DENSITY
// ============================================================================

export interface DensityTokens {
  /** Section padding (rem) */
  sectionPaddingY: string;
  /** Section horizontal padding (rem) */
  sectionPaddingX: string;
  /** Gap between sections (rem) */
  sectionGap: string;
  /** Gap within section content (rem) */
  contentGap: string;
  /** Card padding (rem) */
  cardPadding: string;
  /** Max content width (rem) */
  maxContentWidth: string;
}

export const DENSITY_SCALES: Record<ContentDensity, DensityTokens> = {
  airy: {
    sectionPaddingY: '6rem',
    sectionPaddingX: '2rem',
    sectionGap: '4rem',
    contentGap: '2rem',
    cardPadding: '2rem',
    maxContentWidth: '64rem',
  },
  balanced: {
    sectionPaddingY: '4rem',
    sectionPaddingX: '1.5rem',
    sectionGap: '2.5rem',
    contentGap: '1.5rem',
    cardPadding: '1.5rem',
    maxContentWidth: '72rem',
  },
  dense: {
    sectionPaddingY: '2.5rem',
    sectionPaddingX: '1rem',
    sectionGap: '1.5rem',
    contentGap: '1rem',
    cardPadding: '1rem',
    maxContentWidth: '80rem',
  },
};

// ============================================================================
// ANIMATION PRESETS
// ============================================================================

export interface AnimationTokens {
  /** Whether any animations are enabled */
  enabled: boolean;
  /** Duration for section entrance */
  entranceDuration: string;
  /** Stagger delay between child elements */
  staggerDelay: string;
  /** Easing function */
  easing: string;
  /** Entrance y-offset (px) */
  entranceOffset: string;
}

export const ANIMATION_PRESETS: Record<AnimationLevel, AnimationTokens> = {
  none: {
    enabled: false,
    entranceDuration: '0ms',
    staggerDelay: '0ms',
    easing: 'linear',
    entranceOffset: '0',
  },
  subtle: {
    enabled: true,
    entranceDuration: '500ms',
    staggerDelay: '60ms',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    entranceOffset: '16',
  },
  moderate: {
    enabled: true,
    entranceDuration: '700ms',
    staggerDelay: '100ms',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    entranceOffset: '28',
  },
};

// ============================================================================
// STYLE RESOLVER — generates CSS variables from PortfolioStyle
// ============================================================================

/**
 * Resolves a PortfolioStyle config into a flat CSS variable map.
 * Used by the renderer to apply as inline styles on the root element.
 */
export function resolveStyleTokens(
  style: PortfolioStyle,
  mode: 'light' | 'dark' = 'light'
): Record<string, string> {
  const colorTokens = COLOR_THEMES[style.colorTheme][mode];
  const typeTokens = TYPE_SCALES[style.typeScale];
  const densityTokens = DENSITY_SCALES[style.density];
  const animTokens = ANIMATION_PRESETS[style.animationLevel];

  return {
    // Colors
    '--p-background': colorTokens.background,
    '--p-foreground': colorTokens.foreground,
    '--p-primary': colorTokens.primary,
    '--p-primary-foreground': colorTokens.primaryForeground,
    '--p-secondary': colorTokens.secondary,
    '--p-secondary-foreground': colorTokens.secondaryForeground,
    '--p-muted': colorTokens.muted,
    '--p-muted-foreground': colorTokens.mutedForeground,
    '--p-card': colorTokens.card,
    '--p-card-foreground': colorTokens.cardForeground,
    '--p-border': colorTokens.border,
    '--p-accent': colorTokens.accent,
    '--p-accent-foreground': colorTokens.accentForeground,
    '--p-ring': colorTokens.ring,

    // Typography
    '--p-hero-size': typeTokens.heroSize,
    '--p-h2-size': typeTokens.h2Size,
    '--p-h3-size': typeTokens.h3Size,
    '--p-body-size': typeTokens.bodySize,
    '--p-small-size': typeTokens.smallSize,
    '--p-body-line-height': typeTokens.bodyLineHeight,
    '--p-heading-line-height': typeTokens.headingLineHeight,
    '--p-heading-letter-spacing': typeTokens.headingLetterSpacing,
    '--p-heading-weight': typeTokens.headingWeight,
    '--p-body-weight': typeTokens.bodyWeight,

    // Density
    '--p-section-padding-y': densityTokens.sectionPaddingY,
    '--p-section-padding-x': densityTokens.sectionPaddingX,
    '--p-section-gap': densityTokens.sectionGap,
    '--p-content-gap': densityTokens.contentGap,
    '--p-card-padding': densityTokens.cardPadding,
    '--p-max-content-width': densityTokens.maxContentWidth,

    // Animation
    '--p-anim-enabled': animTokens.enabled ? '1' : '0',
    '--p-anim-duration': animTokens.entranceDuration,
    '--p-anim-stagger': animTokens.staggerDelay,
    '--p-anim-easing': animTokens.easing,
    '--p-anim-offset': animTokens.entranceOffset,
  };
}

/**
 * Returns the Framer Motion animation variants based on animation level.
 */
export function getAnimationVariants(level: AnimationLevel) {
  const tokens = ANIMATION_PRESETS[level];

  if (!tokens.enabled) {
    return {
      initial: {},
      animate: {},
      transition: { duration: 0 },
    };
  }

  const durationMs = parseInt(tokens.entranceDuration, 10);
  const durationSec = durationMs / 1000;
  const offset = parseInt(tokens.entranceOffset, 10);

  return {
    initial: { opacity: 0, y: offset },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: durationSec,
      ease: [0.16, 1, 0.3, 1],
    },
  };
}

/**
 * Returns a blur-in animation variant (for hero elements, featured cards).
 */
export function getBlurInVariants(level: AnimationLevel) {
  const tokens = ANIMATION_PRESETS[level];

  if (!tokens.enabled) {
    return {
      initial: {},
      animate: {},
      transition: { duration: 0 },
    };
  }

  const durationMs = parseInt(tokens.entranceDuration, 10);
  const durationSec = durationMs / 1000;

  return {
    initial: { opacity: 0, filter: 'blur(12px)', y: 10 },
    animate: { opacity: 1, filter: 'blur(0px)', y: 0 },
    transition: {
      duration: durationSec * 1.1,
      ease: [0.16, 1, 0.3, 1],
    },
  };
}

/**
 * Returns a scale-in animation variant (for avatars, stats, etc.).
 */
export function getScaleInVariants(level: AnimationLevel) {
  const tokens = ANIMATION_PRESETS[level];

  if (!tokens.enabled) {
    return {
      initial: {},
      animate: {},
      transition: { duration: 0 },
    };
  }

  const durationMs = parseInt(tokens.entranceDuration, 10);
  const durationSec = durationMs / 1000;

  return {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    transition: {
      duration: durationSec,
      ease: [0.16, 1, 0.3, 1],
    },
  };
}

/**
 * Returns the stagger config for a container of items.
 */
export function getStaggerConfig(level: AnimationLevel) {
  const tokens = ANIMATION_PRESETS[level];

  if (!tokens.enabled) {
    return {
      initial: {},
      animate: {},
      transition: {},
    };
  }

  const staggerMs = parseInt(tokens.staggerDelay, 10);

  return {
    initial: {},
    animate: { transition: { staggerChildren: staggerMs / 1000 } },
    transition: {},
  };
}
