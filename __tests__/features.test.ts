import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isPortfolioEnabled', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED;
  });

  async function importFeatures() {
    return import('@/lib/features');
  }

  it('is disabled by default when env is unset', async () => {
    delete process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED;
    const { isPortfolioEnabled } = await importFeatures();
    expect(isPortfolioEnabled()).toBe(false);
  });

  it('is disabled when env is false', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'false';
    const { isPortfolioEnabled } = await importFeatures();
    expect(isPortfolioEnabled()).toBe(false);
  });

  it('is enabled only when env is exactly true', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'true';
    const { isPortfolioEnabled } = await importFeatures();
    expect(isPortfolioEnabled()).toBe(true);
  });

  it('assertPortfolioEnabled throws when disabled', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'false';
    const { assertPortfolioEnabled } = await importFeatures();
    expect(() => assertPortfolioEnabled()).toThrow(/unavailable/i);
  });

  it('assertPortfolioEnabled is a no-op when enabled', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'true';
    const { assertPortfolioEnabled } = await importFeatures();
    expect(() => assertPortfolioEnabled()).not.toThrow();
  });
});
