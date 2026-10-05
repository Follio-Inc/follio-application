import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUniqueMock, findFirstMock, updateMock, withPrismaRetryMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateMock: vi.fn(),
  withPrismaRetryMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
    profile: {
      findFirst: findFirstMock,
    },
  },
}));

vi.mock('@/lib/prisma-connection', () => ({
  withPrismaRetry: withPrismaRetryMock,
}));

import {
  hasOnboardedProfile,
  resolveActiveProfileContext,
  resolveActiveProfileContextOrNull,
} from '@/lib/active-profile';

describe('active profile resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withPrismaRetryMock.mockImplementation((run: () => Promise<unknown>) => run());
  });

  it('uses the active resume through the resilient database lookup', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'user-1',
      profile: { id: 'resume-2' },
    });

    await expect(resolveActiveProfileContext('clerk-1')).resolves.toEqual({
      userId: 'user-1',
      profileId: 'resume-2',
    });
    expect(withPrismaRetryMock).toHaveBeenCalledWith(expect.any(Function), 'findUnique');
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it('repairs a missing active-resume pointer from an owned resume', async () => {
    findUniqueMock.mockResolvedValue({ id: 'user-1', profile: null });
    findFirstMock.mockResolvedValue({ id: 'resume-1' });
    updateMock.mockResolvedValue({ id: 'user-1' });

    await expect(resolveActiveProfileContext('clerk-1')).resolves.toEqual({
      userId: 'user-1',
      profileId: 'resume-1',
    });
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        profile: {
          connect: { id: 'resume-1' },
        },
      },
    });
  });

  it('reports no onboarding profile only when the local user is absent', async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(resolveActiveProfileContextOrNull('clerk-1')).resolves.toBeNull();
    await expect(hasOnboardedProfile('clerk-1')).resolves.toBe(false);
  });

  it('does not mistake a database failure for an incomplete account', async () => {
    const databaseError = new Error("Can't reach database server");
    findUniqueMock.mockRejectedValue(databaseError);

    await expect(resolveActiveProfileContextOrNull('clerk-1')).rejects.toBe(databaseError);
  });
});
