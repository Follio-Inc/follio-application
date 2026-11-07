import { describe, expect, it } from 'vitest';

import { buildResumeContactItems } from '@/lib/resume/contact';
import type { FilteredProfile } from '@/lib/visibility';

function profile(contactInfo: Record<string, unknown> = {}): FilteredProfile {
  return {
    location: 'Austin, TX',
    contactInfo: {
      email: 'ada@example.com',
      phone: '+15551234567',
      ...contactInfo,
    },
    links: [
      {
        id: 'github',
        type: 'GITHUB',
        label: 'GitHub',
        url: 'https://github.com/ada',
      },
    ],
  } as unknown as FilteredProfile;
}

describe('resume contact order', () => {
  it('defaults to email, phone, location, then links', () => {
    expect(buildResumeContactItems(profile())).toEqual([
      'ada@example.com',
      '+1 (555) 123-4567',
      'Austin, TX',
      'github.com/ada',
    ]);
  });

  it('honors a saved header order', () => {
    expect(
      buildResumeContactItems(
        profile({ headerFieldsOrder: ['location', 'github', 'phone', 'email'] })
      )
    ).toEqual(['Austin, TX', 'github.com/ada', '+1 (555) 123-4567', 'ada@example.com']);
  });
});
