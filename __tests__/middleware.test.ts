import { getSubdomainRewriteUrl } from '@/middleware';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('middleware subdomain rewrite', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED;
  });

  const makeRequest = (pathname: string, host: string) =>
    ({
      nextUrl: {
        pathname,
        clone: () => new URL(`http://${host}${pathname}`),
      },
      headers: { get: (name: string) => (name === 'host' ? host : null) },
    }) as unknown as Parameters<typeof getSubdomainRewriteUrl>[0];

  it('rewrites root subdomain to resume when portfolio is disabled', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'false';
    vi.resetModules();
    const { getSubdomainRewriteUrl: rewrite } = await import('@/middleware');
    const result = rewrite(makeRequest('/', 'alice.follio.me'));
    expect(result?.pathname).toBe('/u/alice/resume');
  });

  it('rewrites root subdomain to portfolio when portfolio is enabled', async () => {
    process.env.NEXT_PUBLIC_PORTFOLIO_ENABLED = 'true';
    vi.resetModules();
    const { getSubdomainRewriteUrl: rewrite } = await import('@/middleware');
    const result = rewrite(makeRequest('/', 'alice.follio.me'));
    expect(result?.pathname).toBe('/u/alice');
  });

  it('rewrites /r subdomain to /u/handle/resume', () => {
    const result = getSubdomainRewriteUrl(makeRequest('/r', 'alice.follio.me'));
    expect(result?.pathname).toBe('/u/alice/resume');
  });

  it('does not rewrite API routes on subdomain', () => {
    const result = getSubdomainRewriteUrl(makeRequest('/api/export/alice/pdf', 'alice.follio.me'));
    expect(result).toBeNull();
  });

  it('does not rewrite TRPC routes on subdomain', () => {
    const result = getSubdomainRewriteUrl(makeRequest('/trpc/something', 'alice.follio.me'));
    expect(result).toBeNull();
  });
});
