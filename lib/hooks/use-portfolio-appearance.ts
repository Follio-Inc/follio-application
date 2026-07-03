import { useEffect, useState } from 'react';

import { resolvePortfolioAppearance } from '@/lib/portfolio-appearance';
import { TEMPLATE_STYLE_DEFAULTS, type PortfolioAppearance } from '@/lib/portfolio/templates/types';

function readSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve a portfolio's appearance to light/dark, listening for OS changes when set to system.
 */
export function useResolvedPortfolioAppearance(
  appearance: PortfolioAppearance | undefined,
  templateDefault: PortfolioAppearance = TEMPLATE_STYLE_DEFAULTS.appearance
): 'light' | 'dark' {
  const effectiveAppearance = appearance ?? templateDefault;
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(readSystemPreference);

  useEffect(() => {
    if (effectiveAppearance !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemPreference(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [effectiveAppearance]);

  return resolvePortfolioAppearance(appearance, systemPreference, templateDefault);
}
