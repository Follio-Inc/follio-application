import { describe, expect, it } from 'vitest';

import {
  authorizationServerMetadata,
  protectedResourceMetadata,
} from '@/lib/ai-connector/oauth-metadata';
import { publicOriginFromHeaders } from '@/lib/ai-connector/public-origin';

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe('public connector origin', () => {
  it('advertises the www host Claude is calling', () => {
    const origin = publicOriginFromHeaders(
      headers({ host: 'www.follio.me', 'x-forwarded-proto': 'https' })
    );

    expect(origin).toBe('https://www.follio.me');
    expect(protectedResourceMetadata(origin)).toMatchObject({
      resource: 'https://www.follio.me/api/mcp',
      authorization_servers: ['https://www.follio.me'],
    });
    expect(authorizationServerMetadata(origin).issuer).toBe('https://www.follio.me');
    expect(authorizationServerMetadata(origin).token_endpoint).toBe(
      'https://www.follio.me/api/oauth/token'
    );
  });

  it('ignores an untrusted forwarded host and uses the real host', () => {
    const origin = publicOriginFromHeaders(
      headers({
        'x-forwarded-host': 'evil.example',
        host: 'www.follio.me',
        'x-forwarded-proto': 'https',
      })
    );

    expect(origin).toBe('https://www.follio.me');
  });

  it('keeps the localhost port', () => {
    expect(
      publicOriginFromHeaders(headers({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }))
    ).toBe('http://localhost:3000');
  });
});
