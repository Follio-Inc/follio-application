import { test, expect, gotoPath } from './helpers';

test.describe('auth.dashboard-gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('dashboard redirects unauthenticated users to sign-in', async ({ page }) => {
    await gotoPath(page, '/dashboard');
    await page.waitForURL(/sign-in|clerk|accounts\./i, { timeout: 20_000 });

    const url = page.url();
    expect(url).toMatch(/sign-in|clerk|accounts\./i);
  });
});
