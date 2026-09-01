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
import { getTestSuite, TEST_SUITES } from '@/_admin-panel/modules/developer/suites-catalog';

describe('admin-panel developer module', () => {
  it('registers developer as a separate nav module from users', () => {
    const ids = ADMIN_PANEL_NAV.map((item) => item.id);
    expect(ids).toContain('developer');
    expect(ids).toContain('users');
    expect(ids).toContain('overview');
    const developer = ADMIN_PANEL_NAV.find((item) => item.id === 'developer');
    expect(developer?.href).toBe('/admin/developer');
  });

  it('exposes named test suites with non-empty patterns', () => {
    expect(TEST_SUITES.length).toBeGreaterThan(0);
    for (const suite of TEST_SUITES) {
      expect(suite.id).toBeTruthy();
      expect(suite.patterns.length).toBeGreaterThan(0);
      expect(getTestSuite(suite.id)?.id).toBe(suite.id);
    }
    expect(getTestSuite('not-a-real-suite')).toBeUndefined();
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
