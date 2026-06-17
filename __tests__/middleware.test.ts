import { getSubdomainRewriteUrl } from '@/middleware';
import { describe, expect, it } from 'vitest';

describe('middleware subdomain rewrite', () => {
  const makeRequest = (pathname: string, host: string) =>
    ({
      nextUrl: {
        pathname,
        clone: () => new URL(`http://${host}${pathname}`),
      },
      headers: { get: (name: string) => (name === 'host' ? host : null) },
    }) as unknown as Parameters<typeof getSubdomainRewriteUrl>[0];

  it('rewrites root subdomain to /u/handle', () => {
    const result = getSubdomainRewriteUrl(makeRequest('/', 'alice.follio.me'));
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
