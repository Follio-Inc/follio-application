import { describe, expect, it } from 'vitest';

import { removeEmailFromList } from '@/lib/hooks/use-contact-manager';

describe('removeEmailFromList', () => {
  it('removes by clerkEmailId even when list was rebuilt after destroy/reload', () => {
    // After deleting unverified email at old index 0, sync rebuilds to [verified only].
    // Stale index 0 would incorrectly wipe the verified email; identity filter must not.
    const emails = [
      {
        email: 'verified@example.com',
        source: 'SIGNUP',
        clerkEmailId: 'idn_verified',
        verified: true,
      },
    ];

    const result = removeEmailFromList(emails, 0, {
      email: 'dummy@example.com',
      clerkEmailId: 'idn_dummy',
    });

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]?.email).toBe('verified@example.com');
    expect(result.primaryEmailIndex).toBe(0);
    expect(result.email).toBe('verified@example.com');
  });

  it('removes the targeted email by clerkEmailId without shifting by index', () => {
    const emails = [
      {
        email: 'dummy@example.com',
        source: 'MANUAL',
        clerkEmailId: 'idn_dummy',
        verified: false,
      },
      {
        email: 'verified@example.com',
        source: 'SIGNUP',
        clerkEmailId: 'idn_verified',
        verified: true,
      },
    ];

    const result = removeEmailFromList(emails, 1, {
      email: 'dummy@example.com',
      clerkEmailId: 'idn_dummy',
    });

    expect(result.emails).toEqual([
      {
        email: 'verified@example.com',
        source: 'SIGNUP',
        clerkEmailId: 'idn_verified',
        verified: true,
      },
    ]);
    expect(result.primaryEmailIndex).toBe(0);
    expect(result.email).toBe('verified@example.com');
  });

  it('removes imported (non-Clerk) emails by address', () => {
    const emails = [
      {
        email: 'verified@example.com',
        source: 'SIGNUP',
        clerkEmailId: 'idn_verified',
        verified: true,
      },
      {
        email: 'Imported@Example.com',
        source: 'RESUME',
        verified: false,
      },
    ];

    const result = removeEmailFromList(emails, 0, {
      email: 'imported@example.com',
    });

    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]?.email).toBe('verified@example.com');
    expect(result.primaryEmailIndex).toBe(0);
  });
});
