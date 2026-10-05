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
});
