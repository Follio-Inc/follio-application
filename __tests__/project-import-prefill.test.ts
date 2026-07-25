import { describe, expect, it } from 'vitest';

import { resolveProjectImportPrefill } from '@/lib/onboarding/project-import-prefill';

describe('resolveProjectImportPrefill', () => {
  it('prefills GitHub from an existing GITHUB link', () => {
    const value = resolveProjectImportPrefill(
      'github',
      [{ type: 'GITHUB', url: 'https://github.com/octocat/' }],
      { knownHandle: 'oauth-user' }
    );
    expect(value).toBe('https://github.com/octocat');
  });

  it('falls back to known GitHub handle when no link exists', () => {
    const value = resolveProjectImportPrefill('github', [{ type: 'LINKEDIN', url: '' }], {
      knownHandle: 'octocat',
    });
    expect(value).toBe('octocat');
  });

  it('prefills Medium from URL pattern when type is missing', () => {
    const value = resolveProjectImportPrefill('medium', [
      { type: 'OTHER', url: 'https://medium.com/@writer' },
    ]);
    expect(value).toBe('https://medium.com/@writer');
  });

  it('prefills Substack from typed link', () => {
    const value = resolveProjectImportPrefill('substack', [
      { type: 'SUBSTACK', url: 'https://notes.substack.com' },
    ]);
    expect(value).toBe('https://notes.substack.com');
  });

  it('prefills Devpost from URL even when typed OTHER', () => {
    const value = resolveProjectImportPrefill('devpost', [
      { type: 'OTHER', url: 'https://devpost.com/builder', label: 'Devpost' },
    ]);
    expect(value).toBe('https://devpost.com/builder');
  });

  it('returns empty string when nothing matches', () => {
    expect(resolveProjectImportPrefill('github', [])).toBe('');
    expect(
      resolveProjectImportPrefill('medium', [{ type: 'GITHUB', url: 'https://github.com/x' }])
    ).toBe('');
  });
});
