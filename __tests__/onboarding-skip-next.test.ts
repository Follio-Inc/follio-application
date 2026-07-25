import { describe, expect, it } from 'vitest';

import {
  hasImportStepAction,
  importStepNextLabel,
  type ImportStepActionState,
} from '@/lib/onboarding/step-action';

const idle: ImportStepActionState = {
  resumeFileName: null,
  uploadedPhoto: null,
  constellationHasAction: false,
  connectedLinkedin: false,
  connectedGithub: false,
  importStatuses: {},
  youtubeChannel: '',
  mediumUsername: '',
  substackUsername: '',
  linkUrls: [],
  linkInput: '',
};

describe('hasImportStepAction', () => {
  it('is false on every data step when untouched', () => {
    for (const step of ['resume', 'photo', 'connect'] as const) {
      expect(hasImportStepAction(step, idle)).toBe(false);
    }
  });

  it('detects resume upload and photo additions', () => {
    expect(hasImportStepAction('resume', { ...idle, resumeFileName: 'cv.pdf' })).toBe(true);
    expect(
      hasImportStepAction('photo', { ...idle, uploadedPhoto: 'data:image/png;base64,x' })
    ).toBe(true);
  });

  it('detects constellation connect actions', () => {
    expect(hasImportStepAction('connect', { ...idle, constellationHasAction: true })).toBe(true);
    expect(hasImportStepAction('connect', { ...idle, connectedGithub: true })).toBe(true);
    expect(
      hasImportStepAction('connect', {
        ...idle,
        importStatuses: { linkedin: 'success' },
      })
    ).toBe(true);
    expect(
      hasImportStepAction('connect', {
        ...idle,
        linkedinProfileInput: 'linkedin.com/in/ada',
      })
    ).toBe(true);
    expect(
      hasImportStepAction('connect', {
        ...idle,
        githubUsername: 'octocat',
      })
    ).toBe(true);
    expect(hasImportStepAction('connect', { ...idle, youtubeChannel: '@me' })).toBe(true);
    expect(hasImportStepAction('connect', { ...idle, portfolioUrl: 'https://ada.dev' })).toBe(true);
    expect(hasImportStepAction('connect', { ...idle, linkUrls: ['https://x.com'] })).toBe(true);
  });
});

describe('importStepNextLabel', () => {
  it('says Skip until the user acts, then Next or Open resume on the last step', () => {
    expect(importStepNextLabel(false, false)).toBe('Skip to Next Step');
    expect(importStepNextLabel(false, true)).toBe('Skip & open resume');
    expect(importStepNextLabel(true, false)).toBe('Next');
    expect(importStepNextLabel(true, true)).toBe('Open resume');
  });
});
