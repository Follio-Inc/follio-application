import { test, expect, gotoPath, assertNotErrorShell } from './helpers';

test.describe('cover-letter.builder-smoke', () => {
  test('cover letter builder chrome loads', async ({ page }) => {
    test.skip(!process.env.LIVE_QA_STORAGE_STATE, 'Set LIVE_QA_STORAGE_STATE for a signed-in user');

    await gotoPath(page, '/cover-letter-builder');
    await assertNotErrorShell(page);
    await expect(page).toHaveURL(/cover-letter/);

    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(40);
  });
});
