import { describe, expect, it } from 'vitest';

import {
  buildGitHubProfileUrl,
  buildLinkedInProfileUrl,
  extractGitHubUsername,
  extractLinkedInSlug,
  isValidGitHubUsername,
  isValidLinkedInSlug,
} from '@/lib/import/profile-url';

describe('extractGitHubUsername', () => {
  it('accepts bare usernames and @handles', () => {
    expect(extractGitHubUsername('octocat')).toBe('octocat');
    expect(extractGitHubUsername('@octocat')).toBe('octocat');
  });

  it('parses full and protocol-less GitHub URLs', () => {
    expect(extractGitHubUsername('https://github.com/octocat')).toBe('octocat');
    expect(extractGitHubUsername('https://github.com/octocat/')).toBe('octocat');
    expect(extractGitHubUsername('github.com/octocat')).toBe('octocat');
    expect(extractGitHubUsername('https://github.com/octocat/hello-world')).toBe('octocat');
  });

  it('validates username format', () => {
    expect(isValidGitHubUsername('octocat')).toBe(true);
    expect(isValidGitHubUsername('-bad')).toBe(false);
    expect(isValidGitHubUsername('a'.repeat(40))).toBe(false);
    expect(buildGitHubProfileUrl('octocat')).toBe('https://github.com/octocat');
  });
});

describe('extractLinkedInSlug', () => {
  it('accepts bare vanity names', () => {
    expect(extractLinkedInSlug('ada-lovelace')).toBe('ada-lovelace');
    expect(extractLinkedInSlug('@ada-lovelace')).toBe('ada-lovelace');
  });

  it('parses /in/ and /pub/ profile URLs', () => {
    expect(extractLinkedInSlug('https://www.linkedin.com/in/ada-lovelace')).toBe('ada-lovelace');
    expect(extractLinkedInSlug('https://linkedin.com/in/ada-lovelace/')).toBe('ada-lovelace');
    expect(extractLinkedInSlug('linkedin.com/in/ada-lovelace')).toBe('ada-lovelace');
    expect(extractLinkedInSlug('https://www.linkedin.com/pub/ada-lovelace/1/2/3')).toBe(
      'ada-lovelace'
    );
  });

  it('validates slug format', () => {
    expect(isValidLinkedInSlug('ada-lovelace')).toBe(true);
    expect(isValidLinkedInSlug('ab')).toBe(false);
    expect(isValidLinkedInSlug('-bad')).toBe(false);
    expect(buildLinkedInProfileUrl('ada-lovelace')).toBe(
      'https://www.linkedin.com/in/ada-lovelace'
    );
  });
});
