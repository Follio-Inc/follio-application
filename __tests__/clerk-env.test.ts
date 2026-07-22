import { describe, expect, it, vi } from 'vitest';

import {
  getClerkAuthorizedParties,
  isClerkDevelopmentPublishableKey,
  warnIfClerkDevelopmentKeysInProduction,
} from '@/lib/clerk-env';

describe('clerk-env', () => {
  it('detects Clerk Development publishable keys', () => {
    expect(isClerkDevelopmentPublishableKey('pk_test_abc')).toBe(true);
    expect(isClerkDevelopmentPublishableKey('pk_live_abc')).toBe(false);
    expect(isClerkDevelopmentPublishableKey(undefined)).toBe(false);
  });

  it('builds authorized parties for apex and www', () => {
    expect(getClerkAuthorizedParties('https://follio.me')).toEqual([
      'https://follio.me',
      'https://www.follio.me',
    ]);
    expect(getClerkAuthorizedParties('https://www.follio.me/')).toEqual([
      'https://www.follio.me',
      'https://follio.me',
    ]);
    expect(getClerkAuthorizedParties(undefined)).toBeUndefined();
  });

  it('warns when production still uses Development keys', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnIfClerkDevelopmentKeysInProduction('pk_test_abc', 'production');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('does not warn for live keys or non-production', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnIfClerkDevelopmentKeysInProduction('pk_live_abc', 'production');
    warnIfClerkDevelopmentKeysInProduction('pk_test_abc', 'development');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
