/**
 * The surviving `modules/developer/` infrastructure.
 *
 * Historical name: this file once covered the DevtoolsPanel overlay, which
 * item 25 retired along with `suites.ts` and `suites-catalog.ts`. What it
 * covers now is the shared code the **new** Developer Platform runs on and
 * which happens to live in the same directory — the local-only guard, the
 * Live QA catalog, the resume-reader catalog, and the quick-link and smoke
 * registries. The suite-registry assertions went with the registry; the
 * guard assertions are the reason this file still matters, because nothing
 * else pins "never in production, even with the opt-in flag".
 */

import { describe, expect, it } from 'vitest';

import { ADMIN_PANEL_NAV } from '@/_admin-panel/nav';
import {
  DeveloperSuitesDisabledError,
  assertCanRunDeveloperSuites,
  assertDevtoolsEnabled,
  canRunDeveloperSuites,
  isDevtoolsEnabled,
} from '@/_admin-panel/modules/developer/guard';
import { getQuickLinks } from '@/_admin-panel/modules/developer/links';
import { getSmokeItems } from '@/_admin-panel/modules/developer/smoke';

describe('admin-panel developer module', () => {
  it('keeps the modules independent in the sidebar', () => {
    const ids = ADMIN_PANEL_NAV.map((item) => item.id);

    expect(ids).toContain('users');
    expect(ids).toContain('overview');
    // Item 25 retired the panel and its sidebar entry; `platform` is the one
    // Developer Platform now. `platform-shell.test.tsx` owns that assertion.
    expect(ids).toContain('platform');
    expect(ids).not.toContain('developer');
  });

  it('exposes smoke items and quick links', () => {
    const smoke = getSmokeItems();
    const links = getQuickLinks();
    expect(smoke.length).toBeGreaterThan(0);
    expect(links.length).toBeGreaterThan(0);
    expect(new Set(smoke.map((s) => s.id)).size).toBe(smoke.length);
    expect(new Set(links.map((l) => l.id)).size).toBe(links.length);
  });

  it('keeps Live QA catalog wired through the developer module', async () => {
    const { LIVE_QA_PATHWAYS } = await import('@/_admin-panel/modules/developer/live-qa');
    expect(LIVE_QA_PATHWAYS.some((pathway) => pathway.id === 'onboarding.upload')).toBe(true);
  });

  it('exposes resume reader catalog from the developer module', async () => {
    const { buildResumeReaderCatalog } = await import('@/_admin-panel/modules/developer/ai');
    const catalog = buildResumeReaderCatalog();
    expect(catalog.defaults.saveToProfile).toBe(false);
    expect(catalog.fixtures.some((item) => item.id === 'alex-morgan')).toBe(true);
  });

  it('never allows suite runs in production, even with the opt-in flag', () => {
    expect(canRunDeveloperSuites({ nodeEnv: 'production', enabledFlag: 'true' })).toBe(false);
    expect(isDevtoolsEnabled({ nodeEnv: 'production', enabledFlag: 'true' })).toBe(false);
    expect(() =>
      assertCanRunDeveloperSuites({ nodeEnv: 'production', enabledFlag: 'true' })
    ).toThrow(DeveloperSuitesDisabledError);
  });

  it('requires DEVTOOLS_ENABLED=true for local suite runs (except test)', () => {
    expect(canRunDeveloperSuites({ nodeEnv: 'development', enabledFlag: 'true' })).toBe(true);
    expect(canRunDeveloperSuites({ nodeEnv: 'development', enabledFlag: '' })).toBe(false);
    expect(canRunDeveloperSuites({ nodeEnv: 'test', enabledFlag: undefined })).toBe(true);
    expect(() =>
      assertDevtoolsEnabled({ nodeEnv: 'development', enabledFlag: 'true' })
    ).not.toThrow();
  });
});
