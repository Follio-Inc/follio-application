import { test, expect, gotoPath, assertNotErrorShell } from './helpers';

test.describe('share.visibility-cycle', () => {
  test('open share and cycle visibility options', async ({ page }) => {
    test.skip(
      !process.env.LIVE_QA_STORAGE_STATE,
      'Set LIVE_QA_STORAGE_STATE for a signed-in session with a resume'
    );

    await gotoPath(page, '/builder');
    await assertNotErrorShell(page);

    const share = page.getByRole('button', { name: /share/i }).first();
    await expect(share).toBeVisible({ timeout: 20_000 });
    await share.click();

    for (const label of ['Public', 'Unlisted', 'Private']) {
      const option = page
        .getByRole('button', { name: new RegExp(`^${label}$`, 'i') })
        .or(page.getByText(new RegExp(`^${label}$`, 'i')));
      if (
        await option
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await option.first().click();
        await page.waitForTimeout(500);
      }
    }

    await assertNotErrorShell(page);
  });
});
