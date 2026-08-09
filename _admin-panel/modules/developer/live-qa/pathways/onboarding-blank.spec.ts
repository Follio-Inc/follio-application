import { test, expect, gotoPath, assertNotErrorShell, liveQaPersona } from './helpers';

test.describe('onboarding.blank', () => {
  test('blank path reaches builder with persona data', async ({ page }) => {
    const persona = liveQaPersona();
    test.skip(!persona, 'Set LIVE_QA_PERSONA_PATH to a persona JSON fixture');
    test.skip(
      !process.env.LIVE_QA_STORAGE_STATE,
      'Set LIVE_QA_STORAGE_STATE to a Playwright storage-state JSON for a signed-in Clerk user'
    );

    await gotoPath(page, '/resumes');
    await assertNotErrorShell(page);

    await page
      .getByRole('button', { name: /new resume/i })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /start blank/i }).click();

    // Blank create opens template gallery modal first
    await expect(page.getByText(/choose a template/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /create resume/i }).click();

    await page.waitForURL(/\/builder|\/onboarding\/build/, { timeout: 60_000 });

    if (page.url().includes('/onboarding/build')) {
      const first = page.getByLabel(/first name/i).first();
      if (await first.isVisible().catch(() => false)) {
        await first.fill(persona!.firstName);
      }
      const last = page.getByLabel(/last name/i).first();
      if (await last.isVisible().catch(() => false)) {
        await last.fill(persona!.lastName);
      }

      for (let i = 0; i < 12; i++) {
        if (page.url().includes('/builder')) break;
        const complete = page
          .getByRole('button', { name: /complete|finish|done|go to builder/i })
          .first();
        if (await complete.isVisible().catch(() => false)) {
          await complete.click();
          break;
        }
        const next = page.getByRole('button', { name: /continue|next|save|skip/i }).first();
        if (await next.isVisible().catch(() => false)) {
          await next.click();
          await page.waitForTimeout(400);
          continue;
        }
        break;
      }
      await page.waitForURL(/\/builder/, { timeout: 90_000 });
    }

    await assertNotErrorShell(page);
    await expect(page).toHaveURL(/\/builder/);
  });
});
