/**
 * Public resume exclusivity + vanity username helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

const mockProfileFindFirst = vi.fn();
const mockProfileFindUnique = vi.fn();
const mockProfileUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    profile: {
      findFirst: (...args: unknown[]) => mockProfileFindFirst(...args),
      findUnique: (...args: unknown[]) => mockProfileFindUnique(...args),
      update: (...args: unknown[]) => mockProfileUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock('@/lib/visibility', () => ({
  applyVisibilityFilter: (p: unknown) => p,
}));

describe('reserved usernames', () => {
  it('blocks system paths', async () => {
    const { isReservedUsername } = await import('@/lib/reserved-usernames');
    expect(isReservedUsername('dashboard')).toBe(true);
    expect(isReservedUsername('r')).toBe(true);
    expect(isReservedUsername('cl')).toBe(true);
    expect(isReservedUsername('u')).toBe(true);
    expect(isReservedUsername('alice')).toBe(false);
  });
});

describe('setExclusiveResumeVisibility', () => {
  beforeEach(() => {
    vi.resetModules();
    mockProfileFindFirst.mockReset();
    mockProfileFindUnique.mockReset();
    mockProfileUpdate.mockReset();
    mockTransaction.mockReset();
  });

  it('updates non-public visibility without demoting others', async () => {
    const { setExclusiveResumeVisibility } = await import('@/lib/public-resume');
    mockProfileUpdate.mockResolvedValue({});

    const result = await setExclusiveResumeVisibility('profile-1', 'UNLISTED');

    expect(result.replacedPublicResume).toBeNull();
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { resumeVisibility: 'UNLISTED' },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('demotes an existing public resume when making another public', async () => {
    const { setExclusiveResumeVisibility } = await import('@/lib/public-resume');

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        profile: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'profile-2',
            userId: 'user-1',
            isArchived: false,
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 'profile-1',
            resumeTitle: 'Main Resume',
            handle: 'alice',
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const result = await setExclusiveResumeVisibility('profile-2', 'PUBLIC');

    expect(result.replacedPublicResume).toEqual({
      id: 'profile-1',
      resumeTitle: 'Main Resume',
      handle: 'alice',
    });
  });
});
