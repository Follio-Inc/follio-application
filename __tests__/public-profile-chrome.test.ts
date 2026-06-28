import { describe, expect, it } from 'vitest';

import { resolvePublicProfileChrome } from '@/lib/public-profile-chrome';

describe('resolvePublicProfileChrome', () => {
  it('hides header and shows visitor footer for anonymous viewers', () => {
    expect(resolvePublicProfileChrome('anonymous', false)).toEqual({
      isVisitorChrome: true,
      showHeader: false,
      effectiveAuthState: 'anonymous',
      showExternalToggle: false,
    });
  });

  it('shows header for authenticated non-owners', () => {
    expect(resolvePublicProfileChrome('authenticated', false)).toEqual({
      isVisitorChrome: false,
      showHeader: true,
      effectiveAuthState: 'authenticated',
      showExternalToggle: false,
    });
  });

  it('shows header and external toggle for owners by default', () => {
    expect(resolvePublicProfileChrome('owner', false)).toEqual({
      isVisitorChrome: false,
      showHeader: true,
      effectiveAuthState: 'owner',
      showExternalToggle: true,
    });
  });

  it('switches owners into visitor chrome when external view is active', () => {
    expect(resolvePublicProfileChrome('owner', true)).toEqual({
      isVisitorChrome: true,
      showHeader: false,
      effectiveAuthState: 'anonymous',
      showExternalToggle: true,
    });
  });
});
