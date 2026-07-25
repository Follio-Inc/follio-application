import { describe, expect, it } from 'vitest';

import {
  formatContactSourceLabel,
  getOAuthProviderDisplayName,
  resolveSignupPortalName,
} from '@/lib/contact/source-label';

describe('getOAuthProviderDisplayName', () => {
  it('maps Clerk provider ids to display names', () => {
    expect(getOAuthProviderDisplayName('oauth_google')).toBe('Google');
    expect(getOAuthProviderDisplayName('google')).toBe('Google');
    expect(getOAuthProviderDisplayName('oauth_linkedin_oidc')).toBe('LinkedIn');
    expect(getOAuthProviderDisplayName('github')).toBe('GitHub');
  });
});

describe('resolveSignupPortalName', () => {
  it('matches email to external account portal', () => {
    expect(
      resolveSignupPortalName('me@gmail.com', [
        { provider: 'oauth_google', emailAddress: 'me@gmail.com' },
        { provider: 'oauth_linkedin_oidc', emailAddress: 'other@linkedin.com' },
      ])
    ).toBe('Google');
  });

  it('returns null when no account matches', () => {
    expect(
      resolveSignupPortalName('solo@example.com', [
        { provider: 'oauth_google', emailAddress: 'other@gmail.com' },
      ])
    ).toBeNull();
  });
});

describe('formatContactSourceLabel', () => {
  it('formats SIGNUP with portal from external accounts', () => {
    expect(
      formatContactSourceLabel('SIGNUP', {
        email: 'me@gmail.com',
        externalAccounts: [{ provider: 'oauth_google', emailAddress: 'me@gmail.com' }],
      })
    ).toBe('Sign Up: Google');
  });

  it('formats SIGNUP with LinkedIn portal', () => {
    expect(
      formatContactSourceLabel('SIGNUP', {
        email: 'me@linkedin.com',
        externalAccounts: [{ provider: 'oauth_linkedin_oidc', emailAddress: 'me@linkedin.com' }],
      })
    ).toBe('Sign Up: LinkedIn');
  });

  it('formats SIGNUP without portal when no OAuth match', () => {
    expect(formatContactSourceLabel('SIGNUP', { email: 'a@b.com', externalAccounts: [] })).toBe(
      'Sign Up'
    );
  });

  it('supports SIGNUP:GOOGLE stored form', () => {
    expect(formatContactSourceLabel('SIGNUP:GOOGLE')).toBe('Sign Up: Google');
  });

  it('formats other sources', () => {
    expect(formatContactSourceLabel('RESUME')).toBe('Resume');
    expect(formatContactSourceLabel('MANUAL')).toBe('Manual');
  });
});
