import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resumeAccessQuery,
  resumeHighlightsHref,
  resumeHighlightsPath,
  resumePresentationHref,
  resumePresentationPath,
} from '@/lib/resume/presentation';

describe('resume presentation', () => {
  it('gives each resume a paper path and a Follio path', () => {
    expect(resumePresentationPath('ada', 'resume')).toBe('/u/ada/resume');
    expect(resumePresentationPath('ada', 'follio')).toBe('/u/ada');
  });

  it('keeps unlisted access when switching views', () => {
    expect(resumeAccessQuery({ token: 't', key: 'k' })).toBe('token=t&key=k');
    expect(resumePresentationHref('ada', 'follio', 'key=k')).toBe('/u/ada?key=k');
    expect(resumePresentationHref('ada', 'resume')).toBe('/u/ada/resume');
  });

  it('opens highlights on their own path, including unlisted access', () => {
    expect(resumeHighlightsPath('ada')).toBe('/u/ada/highlights');
    expect(resumeHighlightsHref('ada', 'key=k')).toBe('/u/ada/highlights?key=k');
  });

  it('offers the Follio view from the public resume and the builder preview', () => {
    const shell = readFileSync(resolve(process.cwd(), 'app/u/[handle]/resume-shell.tsx'), 'utf8');
    const preview = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/builder/components/resume-preview-panel.tsx'),
      'utf8'
    );
    const cards = readFileSync(
      resolve(process.cwd(), 'app/(dashboard)/dashboard/dashboard-resumes-section.tsx'),
      'utf8'
    );

    expect(shell).toContain('current="resume"');
    expect(preview).toContain('FollioPage');
    expect(preview).toContain('ResumePresentationSwitch');
    expect(cards).not.toContain('ResumePresentationSwitch');
  });
});
