import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePublicResumeLink } from '@/lib/shareable-resume-link';

describe('resolvePublicResumeLink', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when there is no public resume', () => {
    expect(
      resolvePublicResumeLink({
        hasPublicResume: false,
        vanityUsername: 'jane',
        activeHandle: 'jane-resume-2',
      })
    ).toBeNull();
  });

  it('returns null for unlisted-only accounts (menu is public-only)', () => {
    expect(
      resolvePublicResumeLink({
        hasPublicResume: false,
        vanityUsername: 'jane',
        activeHandle: 'jane',
      })
    ).toBeNull();
  });

  it('returns the vanity public URL when the account has a public resume', () => {
    const link = resolvePublicResumeLink({
      hasPublicResume: true,
      vanityUsername: 'jane',
      activeHandle: 'jane-resume-2',
    });

    expect(link).toEqual({
      kind: 'public',
      url: 'http://localhost:3000/jane',
      href: '/jane',
      displayHost: 'localhost:3000/jane',
      label: 'Public resume',
    });
  });

  it('falls back to the active handle when vanityUsername is missing', () => {
    const link = resolvePublicResumeLink({
      hasPublicResume: true,
      vanityUsername: null,
      activeHandle: 'jane',
    });

    expect(link?.kind).toBe('public');
    expect(link?.href).toBe('/jane');
    expect(link?.url).toContain('/jane');
  });

  it('returns null for public when no username is available', () => {
    expect(
      resolvePublicResumeLink({
        hasPublicResume: true,
        vanityUsername: null,
        activeHandle: null,
      })
    ).toBeNull();
  });
});
