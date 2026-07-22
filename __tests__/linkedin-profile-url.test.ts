import { afterEach, describe, expect, it, vi } from 'vitest';

import { importLinkedInProfileByUrl } from '@/services/import/linkedin-profile-url.service';

describe('importLinkedInProfileByUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects invalid input', async () => {
    await expect(importLinkedInProfileByUrl('')).rejects.toThrow(/LinkedIn profile URL/);
    await expect(importLinkedInProfileByUrl('ab')).rejects.toThrow(/LinkedIn profile URL/);
  });

  it('saves the canonical profile link when Partner API is not configured', async () => {
    vi.stubEnv('LINKEDIN_API_ACCESS_TOKEN', '');
    const result = await importLinkedInProfileByUrl('linkedin.com/in/ada-lovelace');

    expect(result.fetchedFromApi).toBe(false);
    expect(result.fromLinkedIn.username).toBe('ada-lovelace');
    expect(result.fromLinkedIn.profileUrl).toBe('https://www.linkedin.com/in/ada-lovelace');
    expect(result.links[0]?.url).toBe('https://www.linkedin.com/in/ada-lovelace');
    expect(result.message).toMatch(/linkedin\.com\/in\/ada-lovelace/);
  });

  it('accepts a bare username the same as a full URL', async () => {
    vi.stubEnv('LINKEDIN_API_ACCESS_TOKEN', '');
    const fromUsername = await importLinkedInProfileByUrl('ada-lovelace');
    const fromUrl = await importLinkedInProfileByUrl('https://www.linkedin.com/in/ada-lovelace/');
    expect(fromUsername.fromLinkedIn.profileUrl).toBe(fromUrl.fromLinkedIn.profileUrl);
  });

  it('uses the Partner vanityName API when a token is configured', async () => {
    vi.stubEnv('LINKEDIN_API_ACCESS_TOKEN', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          {
            firstName: { localized: { en_US: 'Ada' } },
            lastName: { localized: { en_US: 'Lovelace' } },
            headline: { localized: { en_US: 'Mathematician' } },
            profilePicture: {
              'displayImage~': {
                elements: [{ identifiers: [{ identifier: 'https://cdn.example/ada.jpg' }] }],
              },
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await importLinkedInProfileByUrl('ada-lovelace');

    expect(result.fetchedFromApi).toBe(true);
    expect(result.profile.firstName).toBe('Ada');
    expect(result.profile.lastName).toBe('Lovelace');
    expect(result.profile.headline).toBe('Mathematician');
    expect(result.profile.avatarUrl).toBe('https://cdn.example/ada.jpg');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('vanityName=ada-lovelace'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('falls back to link-only when Partner API errors', async () => {
    vi.stubEnv('LINKEDIN_API_ACCESS_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'forbidden',
      })
    );

    const result = await importLinkedInProfileByUrl('ada-lovelace');
    expect(result.fetchedFromApi).toBe(false);
    expect(result.fromLinkedIn.profileUrl).toBe('https://www.linkedin.com/in/ada-lovelace');
  });
});
