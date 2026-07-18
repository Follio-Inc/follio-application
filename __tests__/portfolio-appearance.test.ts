import { describe, expect, it } from 'vitest';

import { resolvePortfolioAppearance } from '@/lib/portfolio-appearance';

describe('resolvePortfolioAppearance', () => {
  it('returns dark when appearance is dark', () => {
    expect(resolvePortfolioAppearance('dark', 'light', 'light')).toBe('dark');
  });

  it('returns light when appearance is light', () => {
    expect(resolvePortfolioAppearance('light', 'dark', 'dark')).toBe('light');
  });

  it('follows system preference when appearance is system', () => {
    expect(resolvePortfolioAppearance('system', 'dark', 'light')).toBe('dark');
    expect(resolvePortfolioAppearance('system', 'light', 'dark')).toBe('light');
  });

  it('uses the template default when appearance is omitted', () => {
    expect(resolvePortfolioAppearance(undefined, 'light', 'dark')).toBe('dark');
    expect(resolvePortfolioAppearance(undefined, 'dark', 'light')).toBe('light');
  });
});
