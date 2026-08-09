import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('clearAccountClientState', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    vi.resetModules();
    store.clear();

    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
    vi.stubGlobal('indexedDB', {
      deleteDatabase: () => {
        const request = {
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onblocked: null as (() => void) | null,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes known onboarding and import session keys', async () => {
    sessionStorage.setItem('onboarding_parsed_resume', '{"summary":"old"}');
    sessionStorage.setItem('onboarding_handle', 'old-handle');
    sessionStorage.setItem('importTargetProfileId', 'profile_1');
    sessionStorage.setItem('importReturnUrl', '/builder');
    sessionStorage.setItem('onboarding_template', 'classic');
    sessionStorage.setItem('follio_resume_construct', '1');
    sessionStorage.setItem('unrelated_key', 'keep-me');

    const { clearAccountClientState } = await import('@/lib/account/clear-client-state');
    await clearAccountClientState();

    expect(sessionStorage.getItem('onboarding_parsed_resume')).toBeNull();
    expect(sessionStorage.getItem('onboarding_handle')).toBeNull();
    expect(sessionStorage.getItem('importTargetProfileId')).toBeNull();
    expect(sessionStorage.getItem('importReturnUrl')).toBeNull();
    expect(sessionStorage.getItem('onboarding_template')).toBeNull();
    expect(sessionStorage.getItem('follio_resume_construct')).toBeNull();
    expect(sessionStorage.getItem('unrelated_key')).toBe('keep-me');
  });
});
