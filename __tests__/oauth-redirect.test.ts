import { describe, expect, it } from 'vitest';

import { oauthSeeOther } from '@/lib/ai-connector/oauth-redirect';

describe('oauth callback redirect', () => {
  it('sends Claude the code with GET', () => {
    const response = oauthSeeOther('https://claude.ai/api/mcp/auth_callback', {
      code: 'auth-code',
      state: 'state-token',
    });

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') || '');
    expect(location.origin + location.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(location.searchParams.get('code')).toBe('auth-code');
    expect(location.searchParams.get('state')).toBe('state-token');
  });
});
