import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profileFindFirst: vi.fn(),
  profileUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { profile: { findFirst: mocks.profileFindFirst, update: mocks.profileUpdate } },
}));

import { renameResume } from '@/services/resume-rename.service';

const OWNED = { id: 'p1', handle: 'alex', resumeTitle: 'Product PM' };

describe('renameResume (shared by the website and the MCP tool)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames a resume when the new title is free', async () => {
    mocks.profileFindFirst.mockResolvedValueOnce(OWNED).mockResolvedValueOnce(null);

    const result = await renameResume('user-1', 'p1', '  Stripe PM  ');

    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { resumeTitle: 'Stripe PM' },
    });
    expect(result).toEqual({
      id: 'p1',
      handle: 'alex',
      oldTitle: 'Product PM',
      title: 'Stripe PM',
    });
  });

  it('refuses a title another resume already uses', async () => {
    mocks.profileFindFirst.mockResolvedValueOnce(OWNED).mockResolvedValueOnce({ id: 'p2' });

    await expect(renameResume('user-1', 'p1', 'Stripe PM')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it('only checks non-archived resumes of the same user for duplicates', async () => {
    mocks.profileFindFirst.mockResolvedValueOnce(OWNED).mockResolvedValueOnce(null);

    await renameResume('user-1', 'p1', 'Stripe PM');

    expect(mocks.profileFindFirst).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', resumeTitle: 'Stripe PM', isArchived: false, id: { not: 'p1' } },
      select: { id: true },
    });
  });

  it('does nothing when the title is unchanged', async () => {
    mocks.profileFindFirst.mockResolvedValueOnce(OWNED);

    const result = await renameResume('user-1', 'p1', 'Product PM');

    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(result.oldTitle).toBe(result.title);
  });

  it('refuses a resume the user does not own', async () => {
    mocks.profileFindFirst.mockResolvedValueOnce(null);

    await expect(renameResume('user-1', 'someone-elses', 'New')).rejects.toThrow(
      'Resume not found'
    );
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it('refuses a blank title', async () => {
    await expect(renameResume('user-1', 'p1', '   ')).rejects.toThrow('Title is required');
  });
});
