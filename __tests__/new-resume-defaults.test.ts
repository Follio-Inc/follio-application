import { describe, expect, it } from 'vitest';

import { NEW_RESUME_DEFAULTS } from '@/lib/resume/new-resume-defaults';

describe('NEW_RESUME_DEFAULTS', () => {
  it('starts every new resume as a private draft', () => {
    expect(NEW_RESUME_DEFAULTS).toEqual({
      status: 'DRAFT',
      resumeVisibility: 'PRIVATE',
    });
  });

  it('never defaults a new resume to PUBLIC', () => {
    expect(NEW_RESUME_DEFAULTS.resumeVisibility).not.toBe('PUBLIC');
    expect(NEW_RESUME_DEFAULTS.resumeVisibility).not.toBe('UNLISTED');
  });
});
