import { test, expect, gotoPath, assertNotErrorShell, liveQaLinksHandle } from './helpers';

test.describe('links.public-page', () => {
  test('links route responds without a server error shell', async ({ page }) => {
    const handle = liveQaLinksHandle();
    await gotoPath(page, `/u/${handle}/links`);
    await assertNotErrorShell(page);

    // 404 empty states are OK; 500 shells are not
    const statusish = await page.locator('body').innerText();
    expect(statusish.toLowerCase()).not.toMatch(/internal server error/);
  });
});
