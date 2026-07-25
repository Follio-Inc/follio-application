/**
 * URL Helper Utilities Unit Tests
 *
 * Tests for lib/url.ts — pure string/URL logic with env-dependent behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Save original env
const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe('URL Helpers', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });
  afterEach(() => {
    resetEnv();
  });

  /**
   * Helper to import the module with a fresh env snapshot.
   * Because ROOT_DOMAIN etc. are evaluated at import time,
   * we must re-import after setting env vars.
   */
  async function importUrl() {
    return await import('@/lib/url');
  }

  // ─── Constants ─────────────────────────────────────────────

  describe('ROOT_DOMAIN', () => {
    it('defaults to follio.me', async () => {
      delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
      const { ROOT_DOMAIN } = await importUrl();
      expect(ROOT_DOMAIN).toBe('follio.me');
    });

    it('reads from NEXT_PUBLIC_ROOT_DOMAIN', async () => {
      process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'custom.dev';
      const { ROOT_DOMAIN } = await importUrl();
      expect(ROOT_DOMAIN).toBe('custom.dev');
    });
  });

  describe('PROTOCOL', () => {
    it('is https in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const { PROTOCOL } = await importUrl();
      expect(PROTOCOL).toBe('https');
    });

    it('is http in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const { PROTOCOL } = await importUrl();
      expect(PROTOCOL).toBe('http');
    });
  });

  describe('SUBDOMAIN_ENABLED', () => {
    it('is true when env is "true"', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'true';
      const { SUBDOMAIN_ENABLED } = await importUrl();
      expect(SUBDOMAIN_ENABLED).toBe(true);
    });

    it('is false for any other value', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      const { SUBDOMAIN_ENABLED } = await importUrl();
      expect(SUBDOMAIN_ENABLED).toBe(false);
    });

    it('is false when not set', async () => {
      delete process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED;
      const { SUBDOMAIN_ENABLED } = await importUrl();
      expect(SUBDOMAIN_ENABLED).toBe(false);
    });
  });

  // ─── Internal Navigation Paths ─────────────────────────────

  describe('getPortfolioPath', () => {
    it('returns path-based route', async () => {
      const { getPortfolioPath } = await importUrl();
      expect(getPortfolioPath('alice')).toBe('/u/alice');
    });
  });

  describe('getResumePath', () => {
    it('returns resume path', async () => {
      const { getResumePath } = await importUrl();
      expect(getResumePath('bob')).toBe('/u/bob/resume');
    });
  });

  describe('getLinksPath', () => {
    it('returns links path', async () => {
      const { getLinksPath } = await importUrl();
      expect(getLinksPath('charlie')).toBe('/u/charlie/links');
    });
  });

  // ─── Canonical URLs (subdomains OFF) ───────────────────────

  describe('Canonical URLs with subdomains OFF', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('getPortfolioUrl returns path-based URL', async () => {
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('alice')).toBe('http://localhost:3000/u/alice');
    });

    it('getPortfolioUrl appends unlisted key', async () => {
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('alice', 'abc-123')).toBe('http://localhost:3000/u/alice?key=abc-123');
    });

    it('getPortfolioUrl skips null unlisted key', async () => {
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('alice', null)).toBe('http://localhost:3000/u/alice');
    });

    it('getResumeUrl returns vanity apex path for public resumes', async () => {
      const { getResumeUrl } = await importUrl();
      expect(getResumeUrl('bob')).toBe('http://localhost:3000/bob');
    });

    it('getResumeUrl returns opaque /r/{key} for unlisted resumes', async () => {
      const { getResumeUrl } = await importUrl();
      expect(getResumeUrl('bob', 'key-1')).toBe('http://localhost:3000/r/key-1');
    });

    it('getLinksUrl returns path-based URL', async () => {
      const { getLinksUrl } = await importUrl();
      expect(getLinksUrl('charlie')).toBe('http://localhost:3000/u/charlie/links');
    });

    it('getLinksUrl appends unlisted key', async () => {
      const { getLinksUrl } = await importUrl();
      expect(getLinksUrl('charlie', 'x')).toBe('http://localhost:3000/u/charlie/links?key=x');
    });
  });

  // ─── Canonical URLs (subdomains ON) ────────────────────────

  describe('Canonical URLs with subdomains ON', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'true';
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.NEXT_PUBLIC_ROOT_DOMAIN; // use default follio.me
    });

    it('getPortfolioUrl returns subdomain URL', async () => {
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('alice')).toBe('https://alice.follio.me');
    });

    it('getPortfolioUrl with unlisted key', async () => {
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('alice', 'secret')).toBe('https://alice.follio.me?key=secret');
    });

    it('getResumeUrl returns apex vanity URL (not subdomain)', async () => {
      const { getResumeUrl } = await importUrl();
      expect(getResumeUrl('bob')).toBe('https://follio.me/bob');
    });

    it('getResumeUrl returns opaque apex /r/{key} for unlisted', async () => {
      const { getResumeUrl } = await importUrl();
      expect(getResumeUrl('bob', 'secret')).toBe('https://follio.me/r/secret');
    });

    it('getLinksUrl returns subdomain /l URL', async () => {
      const { getLinksUrl } = await importUrl();
      expect(getLinksUrl('charlie')).toBe('https://charlie.follio.me/l');
    });
  });

  // ─── getDisplayHost ────────────────────────────────────────

  describe('getDisplayHost', () => {
    it('returns subdomain format when subdomains ON', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'true';
      const { getDisplayHost } = await importUrl();
      expect(getDisplayHost('alice')).toBe('alice.follio.me');
    });

    it('appends suffix for subdomain', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'true';
      const { getDisplayHost } = await importUrl();
      expect(getDisplayHost('alice', '/r')).toBe('alice.follio.me/r');
    });

    it('strips protocol for non-subdomain mode', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      process.env.NEXT_PUBLIC_APP_URL = 'https://my-app.vercel.app';
      const { getDisplayHost } = await importUrl();
      expect(getDisplayHost('bob')).toBe('my-app.vercel.app/u/bob');
    });

    it('appends suffix in non-subdomain mode', async () => {
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      process.env.NEXT_PUBLIC_APP_URL = 'https://my-app.vercel.app';
      const { getDisplayHost } = await importUrl();
      expect(getDisplayHost('bob', '/resume')).toBe('my-app.vercel.app/u/bob/resume');
    });
  });

  // ─── extractHandleFromHost ─────────────────────────────────

  describe('extractHandleFromHost', () => {
    it('extracts handle from valid subdomain', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('john.follio.me')).toBe('john');
    });

    it('returns null for bare root domain', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('follio.me')).toBeNull();
    });

    it('returns null for www (reserved)', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('www.follio.me')).toBeNull();
    });

    it('returns null for other reserved subdomains', async () => {
      const { extractHandleFromHost } = await importUrl();
      const reserved = ['api', 'admin', 'mail', 'blog', 'docs', 'status', 'app'];
      for (const sub of reserved) {
        expect(extractHandleFromHost(`${sub}.follio.me`)).toBeNull();
      }
    });

    it('returns null for multi-level subdomains', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('a.b.follio.me')).toBeNull();
    });

    it('returns null for localhost', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('localhost')).toBeNull();
    });

    it('strips port before matching', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('john.follio.me:3000')).toBe('john');
    });

    it('lowercases the extracted handle', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('JohnDoe.follio.me')).toBe('johndoe');
    });

    it('returns null for unrelated domain', async () => {
      const { extractHandleFromHost } = await importUrl();
      expect(extractHandleFromHost('john.example.com')).toBeNull();
    });
  });

  // ─── isMainDomain ─────────────────────────────────────────

  describe('isMainDomain', () => {
    it('returns true for root domain', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('follio.me')).toBe(true);
    });

    it('returns true for www.root', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('www.follio.me')).toBe(true);
    });

    it('returns true for localhost', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('localhost')).toBe(true);
    });

    it('returns true for 127.0.0.1', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('127.0.0.1')).toBe(true);
    });

    it('strips port before checking', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('localhost:3000')).toBe(true);
    });

    it('returns false for user subdomain', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('john.follio.me')).toBe(false);
    });

    it('returns false for unrelated domain', async () => {
      const { isMainDomain } = await importUrl();
      expect(isMainDomain('example.com')).toBe(false);
    });
  });

  // ─── Fallback base URL logic ───────────────────────────────

  describe('Base URL fallback', () => {
    it('falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is absent', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      process.env.VERCEL_URL = 'my-deploy.vercel.app';
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('test')).toBe('https://my-deploy.vercel.app/u/test');
    });

    it('falls back to localhost:3000 when no URL env vars set', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_URL;
      process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED = 'false';
      const { getPortfolioUrl } = await importUrl();
      expect(getPortfolioUrl('test')).toBe('http://localhost:3000/u/test');
    });
  });
});
