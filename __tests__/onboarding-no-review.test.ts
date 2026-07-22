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

  it('uses constellation connect as the final data step', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain("['resume', 'photo', 'connect']");
    expect(src).toContain('ConstellationField');
    expect(src).toContain('importConstellationPlatform');
    expect(src).toContain('youtubeVideos');
    expect(src).toContain("parsed.currentStep === 'review'");
    expect(src).toContain('key="step-connect"');
    expect(src).not.toContain('STEP 4: ADDITIONAL PLATFORMS');
    expect(src).not.toContain('STEP 3: CONNECT ACCOUNTS');
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
