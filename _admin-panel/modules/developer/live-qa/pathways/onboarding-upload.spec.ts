import { test, expect, gotoPath, assertNotErrorShell, liveQaResumePdf } from './helpers';

test.describe('onboarding.upload', () => {
  test('upload resume PDF reaches builder', async ({ page }) => {
    const pdf = liveQaResumePdf();
    test.skip(!pdf, 'Set LIVE_QA_RESUME_PDF (and auth storage state) to run upload pathway');
    test.skip(
      !process.env.LIVE_QA_STORAGE_STATE,
      'Set LIVE_QA_STORAGE_STATE to a Playwright storage-state JSON for a signed-in Clerk user'
    );

    // Returning users: create via resumes library (onboarding/import redirects away)
    await gotoPath(page, '/resumes');
    await assertNotErrorShell(page);

    await page
      .getByRole('button', { name: /new resume/i })
      .first()
      .click();
    await page
      .getByRole('menuitem', { name: /upload resume/i })
      .or(page.getByRole('button', { name: /upload resume/i }))
      .first()
      .click();

    // Land on import / upload surface
    await page.waitForTimeout(800);
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 20_000 });
    await fileInput.setInputFiles(pdf!);

    // Parse + template gallery — tolerate slow AI parse
    await expect(
      page.getByText(/choose (your resume )?template|choose a template/i).first()
    ).toBeVisible({ timeout: 120_000 });

    const apply = page
      .getByRole('button', { name: /apply template|use template|continue|confirm/i })
      .first();
    if (await apply.isVisible().catch(() => false)) {
      await apply.click();
    } else {
      // Fallback: select a named template card then apply if it appears
      await page
        .getByText(/classic|lumen|sleek/i)
        .first()
        .click();
      const applyAgain = page.getByRole('button', { name: /apply template/i }).first();
      if (await applyAgain.isVisible().catch(() => false)) {
        await applyAgain.click();
      }
    }

    await page.waitForURL(/\/builder/, { timeout: 90_000 });
    await assertNotErrorShell(page);
    await expect(page).toHaveURL(/\/builder/);
  });
});
