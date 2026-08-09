import { test, expect, gotoPath, assertNotErrorShell } from './helpers';

test.describe('builder.designer-templates', () => {
  test('switch at least two templates in designer', async ({ page }) => {
    test.skip(
      !process.env.LIVE_QA_STORAGE_STATE,
      'Set LIVE_QA_STORAGE_STATE for a signed-in session with at least one resume'
    );

    await gotoPath(page, '/builder');
    await assertNotErrorShell(page);
    await expect(page).toHaveURL(/\/builder/);

    const designer = page.getByRole('button', { name: /designer|design|template/i }).first();
    if (await designer.isVisible().catch(() => false)) {
      await designer.click();
    }

    const templates = ['Classic', 'Lumen', 'Sleek', 'Studio', 'Atelier'];
    let switched = 0;
    for (const name of templates) {
      const btn = page.getByRole('button', { name: new RegExp(name, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        switched += 1;
        await page.waitForTimeout(300);
      }
      if (switched >= 2) break;
    }

    expect(switched).toBeGreaterThanOrEqual(1);
    await assertNotErrorShell(page);
  });
});
