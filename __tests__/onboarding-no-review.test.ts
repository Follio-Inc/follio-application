import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('onboarding blank build + upload builder paths', () => {
  it('upload completes from import and redirects to /builder', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain('handleCompleteOnboarding');
    expect(src).toContain("router.push(returnUrl || '/builder')");
    expect(src).toContain('/api/onboarding/complete');
    expect(src).toContain("router.push('/onboarding/build?step=profile')");
    expect(src).not.toContain('Go to Dashboard');
    expect(src).not.toContain(
      "type OnboardingStep = 'resume' | 'photo' | 'accounts' | 'platforms' | 'review'"
    );
  });

  it('uses resume as the only active onboarding step', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain("const STEPS: OnboardingStep[] = ['resume']");
    // Photo + connect UI kept for re-enable, but not in the active framework path
    expect(src).toContain('key="step-photo"');
    expect(src).toContain('key="step-connect"');
    expect(src).toContain('ConstellationField');
    expect(src).toContain('importConstellationPlatform');
    expect(src).toContain('youtubeVideos');
    expect(src).toContain("parsed.currentStep === 'review'");
    expect(src).not.toContain("['resume', 'photo', 'connect']");
    expect(src).not.toContain('STEP 4: ADDITIONAL PLATFORMS');
    expect(src).not.toContain('STEP 3: CONNECT ACCOUNTS');
  });

  it('blank opens guided build; upload opens template gallery then construction handoff', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain("if (path === 'blank')");
    expect(src).toContain('// Blank path: seed signup name/email, then walk through guided build');
    expect(src).toContain("sessionStorage.setItem('onboarding_parsed_resume'");
    expect(src).toContain("router.push('/onboarding/build?step=profile')");
    expect(src).toContain('openTemplateGalleryAfterParse');
    expect(src).toContain('ResumeTemplateGallery');
    expect(src).toContain('previewDataPolicy={TEMPLATE_PREVIEW_ON_CREATE}');
    expect(src).toContain('resumeDesign: selectedResumeDesign');
    expect(src).toContain('fromUpload: true');
    expect(src).toContain('RESUME_CONSTRUCTION_SESSION_KEY');
    expect(src).not.toContain('goNext();\n      return;');
  });

  it('restores the guided build page for blank onboarding with URL steps', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/build/page.tsx'), 'utf8');

    expect(src).toContain('handleSaveProfile');
    expect(src).toContain("router.push(returnUrl || '/builder')");
    expect(src).toContain('parseBuildStep');
    expect(src).toContain('goToStep');
    expect(src).toContain('/onboarding/build?');
    expect(src).toContain("'profile'");
    expect(src).toContain("'contact'");
    expect(src).toContain("'links'");
    expect(src).toContain("'experience'");
    expect(src).toContain("'education'");
    expect(src).toContain("'projects'");
    expect(src).toContain("'summary'");
    expect(src).toContain('Professional Summary');
    expect(src).toContain('DEFAULT_LINK_SLOTS');
    expect(src).toContain('MORE_LINK_SLOTS');
    expect(src).toContain('Personal website');
    expect(src).toContain('resolveLinkSlotUrl');
    expect(src).toContain('addMoreLinkSlot');
    expect(src).toContain('Username or full profile URL both work');
    expect(src).toContain('ResumeTemplateGallery');
    expect(src).toContain('previewDataPolicy={TEMPLATE_PREVIEW_ON_CREATE}');
    expect(src).toContain('handleOpenTemplateGallery');
    expect(src).toContain('resumeDesign: selectedResumeDesign');
    expect(src).not.toContain("redirect('/onboarding/import')");
  });

  it('build hide/unhide matches builder resume visibility controls', () => {
    const buildSrc = readFileSync(resolve(process.cwd(), 'app/onboarding/build/page.tsx'), 'utf8');
    const completeSrc = readFileSync(
      resolve(process.cwd(), 'app/api/onboarding/complete/route.ts'),
      'utf8'
    );

    expect(buildSrc).toContain('EyeOff');
    expect(buildSrc).toContain('Hide from resume');
    expect(buildSrc).toContain('Show on resume');
    expect(buildSrc).toContain('toggleLinkVisibility');
    expect(buildSrc).toContain('isVisible: exp.isVisible !== false');
    expect(buildSrc).toContain('isVisible: edu.isVisible !== false');
    expect(buildSrc).toContain('isVisible: link.isVisible !== false');
    expect(completeSrc).toContain('isVisible: exp.isVisible !== false');
    expect(completeSrc).toContain('isVisible: edu.isVisible !== false');
    expect(completeSrc).toContain('isVisible: link.isVisible !== false');
  });

  it('documents blank → build and upload → builder', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/page.tsx'), 'utf8');

    expect(src).toContain('/onboarding/build');
    expect(src).toContain('/builder');
  });

  it('redirects legacy /onboarding/review to /onboarding/build', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/review/page.tsx'), 'utf8');

    expect(src).toContain("redirect(qs ? `/onboarding/build?${qs}` : '/onboarding/build')");
  });
});
