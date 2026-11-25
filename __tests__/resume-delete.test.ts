import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  profileFindMany: vi.fn(),
  profileFindFirst: vi.fn(),
  profileCount: vi.fn(),
  profileDeleteMany: vi.fn(),
  makeProfilePortfolioReady: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    profile: {
      findMany: mocks.profileFindMany,
      findFirst: mocks.profileFindFirst,
      count: mocks.profileCount,
      deleteMany: mocks.profileDeleteMany,
    },
  },
}));

vi.mock('@/lib/active-profile', () => ({
  makeProfilePortfolioReady: mocks.makeProfilePortfolioReady,
}));

import { deleteResumes } from '@/services/resume-delete.service';

/** A user whose builder shows p1 and whose portfolio uses p2. */
function setUser() {
  mocks.userFindUnique.mockResolvedValue({
    id: 'user-1',
    profile: { id: 'p1' },
    primaryProfile: { id: 'p2' },
  });
}

describe('deleteResumes (shared by the website and the MCP tool)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser();
  });

  it('deletes a resume that is neither active nor the portfolio without re-pointing anything', async () => {
    mocks.profileFindMany.mockResolvedValue([{ id: 'p3', resumeTitle: 'Backend' }]);
    mocks.profileCount.mockResolvedValue(3);

    const result = await deleteResumes('user-1', ['p3']);

    expect(mocks.profileDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['p3'] }, userId: 'user-1' },
    });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({
      deleted: [{ id: 'p3', title: 'Backend' }],
      newActive: null,
      newPrimary: null,
    });
  });

  it('deletes nothing if any resume is not the user’s', async () => {
    mocks.profileFindMany.mockResolvedValue([{ id: 'p3', resumeTitle: 'Backend' }]);

    await expect(deleteResumes('user-1', ['p3', 'someone-elses'])).rejects.toThrow(
      'Resume not found'
    );
    expect(mocks.profileDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete the only resume', async () => {
    mocks.profileFindMany.mockResolvedValue([{ id: 'p1', resumeTitle: 'Product PM' }]);
    mocks.profileCount.mockResolvedValue(1);

    await expect(deleteResumes('user-1', ['p1'])).rejects.toThrow('Cannot delete your only resume');
    expect(mocks.profileDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete every resume at once', async () => {
    mocks.profileFindMany.mockResolvedValue([
      { id: 'p1', resumeTitle: 'Product PM' },
      { id: 'p2', resumeTitle: 'Stripe PM' },
    ]);
    mocks.profileCount.mockResolvedValue(2);

    await expect(deleteResumes('user-1', ['p1', 'p2'])).rejects.toThrow(
      'Cannot delete all of your resumes'
    );
    expect(mocks.profileDeleteMany).not.toHaveBeenCalled();
  });

  it('re-points the builder and portfolio at the oldest remaining resume', async () => {
    mocks.profileFindMany.mockResolvedValue([
      { id: 'p1', resumeTitle: 'Product PM' },
      { id: 'p2', resumeTitle: 'Stripe PM' },
    ]);
    mocks.profileCount.mockResolvedValue(3);
    mocks.profileFindFirst.mockResolvedValue({ id: 'p3', resumeTitle: 'Backend' });

    const result = await deleteResumes('user-1', ['p1', 'p2']);

    // The portfolio's new resume is made renderable before it becomes primary.
    expect(mocks.makeProfilePortfolioReady).toHaveBeenCalledWith('p3');
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        profile: { connect: { id: 'p3' } },
        primaryProfile: { connect: { id: 'p3' } },
      },
    });
    expect(result.newActive).toEqual({ id: 'p3', title: 'Backend' });
    expect(result.newPrimary).toEqual({ id: 'p3', title: 'Backend' });
  });

  it('only prepares a portfolio when the portfolio resume was deleted', async () => {
    mocks.profileFindMany.mockResolvedValue([{ id: 'p1', resumeTitle: 'Product PM' }]);
    mocks.profileCount.mockResolvedValue(3);
    mocks.profileFindFirst.mockResolvedValue({ id: 'p2', resumeTitle: 'Stripe PM' });

    const result = await deleteResumes('user-1', ['p1']);

    expect(mocks.makeProfilePortfolioReady).not.toHaveBeenCalled();
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { profile: { connect: { id: 'p2' } } },
    });
    expect(result.newActive).toEqual({ id: 'p2', title: 'Stripe PM' });
    expect(result.newPrimary).toBeNull();
  });
});
