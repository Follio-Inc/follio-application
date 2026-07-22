import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RESUME_START_OPTIONS } from '@/components/onboarding/resume-start-choice';

describe('onboarding resume start choice', () => {
  it('exposes upload and start-blank as the two primary options', () => {
    expect(RESUME_START_OPTIONS.map((o) => o.id)).toEqual(['upload', 'blank']);
    expect(RESUME_START_OPTIONS.find((o) => o.id === 'upload')?.title).toBe('Upload Resume');
    expect(RESUME_START_OPTIONS.find((o) => o.id === 'blank')?.title).toBe('Start Blank');
  });

  it('renders side-by-side US-letter thumbnails for upload and blank', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'components/onboarding/resume-start-choice.tsx'),
      'utf8'
    );

    expect(src).toContain('grid-cols-2');
    expect(src).toContain('aspect-[8.5/11]');
    expect(src).toContain('ExistingResumeIcon');
    expect(src).toContain('BlankResumeIcon');
    expect(src).toContain('gap-4');
    expect(src).toContain('sm:gap-5');
    expect(src).toContain('w-[6.25rem]');
    expect(src).toContain('sm:w-[7.25rem]');
  });

  it('styles the two choices with primary blue button CTAs', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'components/onboarding/resume-start-choice.tsx'),
      'utf8'
    );

    expect(src).toContain('buttonVariants');
    expect(src).toContain('Upload Resume');
    expect(src).toContain('Start Blank');
  });

  it('wires the choice component into the import onboarding step', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain('ResumeStartChoice');
    expect(src).toContain('How do you want to start?');
    expect(src).toContain('showResumeChoice');
    expect(src).toContain('handleResumeStartSelect');
    // Resume choice hides the footer; Start Blank is the no-upload path
    expect(src).toContain('!showResumeChoice');
    // Single adaptive CTA — no separate Skip button
    expect(src).toContain('importStepNextLabel');
    expect(src).toContain('hasImportStepAction');
    expect(src).toContain('primaryNextLabel');
    expect(src).not.toContain('Skip on optional steps');
  });

  it('opens the file picker on upload without navigating to a separate dropzone page', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    // Upload stays on this page — trigger the hidden input, do not set a separate view
    expect(src).toContain("document.getElementById('resume-upload')?.click()");
    expect(src).not.toContain("setResumeStartView('upload')");
    expect(src).not.toContain("useState<'choice' | 'upload'>");

    // Once a file is selected, choice is replaced by the loading/preview UI
    expect(src).toContain("showResumeChoice = currentStep === 'resume' && !resumeFileName");
    expect(src).toContain('AI parsing in');
    expect(src).toContain('You can continue to the next step while we parse');
  });

  it('confirms before discarding an uploaded resume back to the choice screen', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/onboarding/import/page.tsx'), 'utf8');

    expect(src).toContain('showDiscardResumeDialog');
    expect(src).toContain('Discard uploaded resume?');
    expect(src).toContain('discardResumeAndReturnToChoice');
    expect(src).toContain('clearResumeUpload()');
    // Back from uploader opens confirm instead of silently clearing
    expect(src).toContain('setShowDiscardResumeDialog(true)');
  });
});
