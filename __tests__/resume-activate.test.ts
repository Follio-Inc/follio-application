import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profileFindFirst: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    profile: { findFirst: mocks.profileFindFirst },
    $transaction: (work: (tx: unknown) => Promise<unknown>) =>
      work({ user: { update: mocks.userUpdate } }),
  },
}));

import { activateResume } from '@/services/resume-activate.service';

describe('activateResume (shared by the website and the MCP tool)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes the resume the one the builder shows', async () => {
    mocks.profileFindFirst.mockResolvedValue({ id: 'p2', resumeTitle: 'Stripe PM' });

    const result = await activateResume('user-1', 'p2');

    expect(mocks.profileFindFirst).toHaveBeenCalledWith({
      where: { id: 'p2', userId: 'user-1', isArchived: false },
      select: { id: true, resumeTitle: true },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { profile: { connect: { id: 'p2' } } },
    });
    expect(result).toEqual({ id: 'p2', title: 'Stripe PM' });
  });

  it('refuses a resume the user does not own, or an archived one', async () => {
    mocks.profileFindFirst.mockResolvedValue(null);

    await expect(activateResume('user-1', 'someone-elses')).rejects.toThrow('Resume not found');
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
