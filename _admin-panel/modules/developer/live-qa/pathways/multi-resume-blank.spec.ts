import { test, expect, gotoPath, assertNotErrorShell } from './helpers';

test.describe('multi-resume.create-blank', () => {
  test('create another blank resume', async ({ page }) => {
    test.skip(
      !process.env.LIVE_QA_STORAGE_STATE,
      'Set LIVE_QA_STORAGE_STATE for a signed-in onboarded user'
    );

    await gotoPath(page, '/resumes');
    await assertNotErrorShell(page);

    const beforeCount = await page.getByRole('button', { name: /^edit$/i }).count();

    await page
      .getByRole('button', { name: /new resume/i })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /start blank/i }).click();

    await expect(page.getByText(/choose a template/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /create resume/i }).click();

    await page.waitForURL(/\/builder|\/onboarding/, { timeout: 60_000 });
    await assertNotErrorShell(page);

    await gotoPath(page, '/resumes');
    await expect(page.getByRole('button', { name: /new resume/i }).first()).toBeVisible();
    const afterCount = await page.getByRole('button', { name: /^edit$/i }).count();
    expect(afterCount).toBeGreaterThanOrEqual(Math.max(beforeCount, 1));
  });
});
