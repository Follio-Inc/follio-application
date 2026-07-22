import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('onboarding lands on builder without review', () => {
  it('completes from import and redirects to /builder', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain('handleCompleteOnboarding');
    expect(src).toContain("router.push(returnUrl || '/builder')");
    expect(src).toContain('/api/onboarding/complete');
    expect(src).not.toContain('/onboarding/review');
    expect(src).not.toContain('Go to Dashboard');
    expect(src).not.toContain(
      "type OnboardingStep = 'resume' | 'photo' | 'accounts' | 'platforms' | 'review'"
    );
  });

  it('drops review from the import step list', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain("['resume', 'photo', 'accounts', 'platforms']");
    expect(src).toContain("parsed.currentStep === 'review'");
  });

  it('puts personal portfolio first on the platforms step', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');
    const platformsIdx = src.indexOf("currentStep === 'platforms'");
    const portfolioIdx = src.indexOf('Personal portfolio', platformsIdx);
    const youtubeIdx = src.indexOf('{/* YouTube */}', platformsIdx);

    expect(platformsIdx).toBeGreaterThan(-1);
    expect(portfolioIdx).toBeGreaterThan(platformsIdx);
    expect(youtubeIdx).toBeGreaterThan(portfolioIdx);
    expect(src).toContain("type: 'PORTFOLIO'");
    expect(src).toContain('portfolioUrl');
  });

  it('redirects legacy /onboarding/review bookmarks back to import', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/review/page.tsx'), 'utf8');

    expect(src).toContain("redirect('/onboarding/import')");
    expect(src).not.toContain('handleSaveProfile');
  });

  it('documents the flow without a review step', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/page.tsx'), 'utf8');

    expect(src).toContain('/builder');
    expect(src).not.toContain('/onboarding/review');
  });
});
