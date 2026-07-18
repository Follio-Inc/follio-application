import {
  TEMPLATE_STYLE_DEFAULTS,
  type PortfolioAppearance,
  type TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

/**
 * Resolve a portfolio appearance setting to a concrete light/dark value.
 * For `system`, pass the current OS preference (defaults to light on the server).
 */
export function resolvePortfolioAppearance(
  appearance: PortfolioAppearance | undefined,
  systemPreference: 'light' | 'dark' = 'light',
  templateDefault: PortfolioAppearance = TEMPLATE_STYLE_DEFAULTS.appearance
): 'light' | 'dark' {
  const mode = appearance ?? templateDefault;
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemPreference;
}

/** Effective appearance for a saved style config, using the kit default when unset. */
export function getEffectivePortfolioAppearance(
  style: TemplateStyleConfig | undefined,
  templateDefault: PortfolioAppearance = TEMPLATE_STYLE_DEFAULTS.appearance
): PortfolioAppearance {
  return style?.appearance ?? templateDefault;
}
