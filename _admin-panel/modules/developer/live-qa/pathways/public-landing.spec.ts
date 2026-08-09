import { test, expect, gotoPath, assertNotErrorShell } from './helpers';

test.describe('public.landing', () => {
  // Marketing CTA only appears for anonymous visitors — signed-in users redirect to dashboard.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('marketing landing loads with a primary CTA', async ({ page }) => {
    await gotoPath(page, '/');
    await assertNotErrorShell(page);

    const cta = page
      .getByRole('link', { name: /sign up|get started|start|join|create|sign in/i })
      .or(page.getByRole('button', { name: /sign up|get started|start|join|create|sign in/i }))
      .first();

    await expect(cta).toBeVisible({ timeout: 15_000 });
  });
});
