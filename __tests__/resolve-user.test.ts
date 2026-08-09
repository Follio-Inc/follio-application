import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'status' in error && 'errors' in error),
}));

const { findUniqueMock, createMock, updateMock, getUserMock, deleteLocalAccountDataMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    createMock: vi.fn(),
    updateMock: vi.fn(),
    getUserMock: vi.fn(),
    deleteLocalAccountDataMock: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      create: createMock,
      update: updateMock,
    },
  },
}));

vi.mock('@/lib/account/delete-account', () => ({
  deleteLocalAccountData: deleteLocalAccountDataMock,
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: { getUser: getUserMock },
  })),
}));

import {
  EmailConflictError,
  getOrCreateUserForClerk,
  isClerkUserMissing,
} from '@/lib/account/resolve-user';

describe('isClerkUserMissing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when Clerk user exists', async () => {
    getUserMock.mockResolvedValue({ id: 'clerk_1' });
    await expect(isClerkUserMissing('clerk_1')).resolves.toBe(false);
  });

  it('returns true when Clerk returns 404', async () => {
    getUserMock.mockRejectedValue({
      status: 404,
      errors: [{ code: 'resource_not_found' }],
    });
    await expect(isClerkUserMissing('clerk_gone')).resolves.toBe(true);
  });

  it('rethrows unexpected Clerk errors', async () => {
    getUserMock.mockRejectedValue({
      status: 500,
      errors: [{ code: 'internal_error' }],
    });
    await expect(isClerkUserMissing('clerk_1')).rejects.toMatchObject({ status: 500 });
  });
});

describe('getOrCreateUserForClerk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user when clerkId already exists', async () => {
    const existing = { id: 'u1', clerkId: 'clerk_new', email: 'a@b.com', profile: null };
    findUniqueMock.mockResolvedValueOnce(existing);

    const result = await getOrCreateUserForClerk({
      clerkId: 'clerk_new',
      email: 'a@b.com',
    });

    expect(result).toBe(existing);
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates a new user when email is free', async () => {
    findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const created = { id: 'u2', clerkId: 'clerk_new', email: 'a@b.com', profile: null };
    createMock.mockResolvedValue(created);

    const result = await getOrCreateUserForClerk({
      clerkId: 'clerk_new',
      email: 'a@b.com',
    });

    expect(result).toBe(created);
    expect(createMock).toHaveBeenCalledWith({
      data: { clerkId: 'clerk_new', email: 'a@b.com' },
      include: { profile: true },
    });
  });

  it('purges an orphaned row and creates a clean user when the old Clerk user is gone', async () => {
    findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'u_orphan',
      clerkId: 'clerk_old',
      email: 'a@b.com',
      profile: { id: 'p1', summary: 'old summary from deleted account' },
    });
    getUserMock.mockRejectedValue({
      status: 404,
      errors: [{ code: 'resource_not_found' }],
    });
    deleteLocalAccountDataMock.mockResolvedValue(undefined);
    const created = {
      id: 'u_new',
      clerkId: 'clerk_new',
      email: 'a@b.com',
      profile: null,
    };
    createMock.mockResolvedValue(created);

    const result = await getOrCreateUserForClerk({
      clerkId: 'clerk_new',
      email: 'a@b.com',
    });

    expect(deleteLocalAccountDataMock).toHaveBeenCalledWith('u_orphan');
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({
      data: { clerkId: 'clerk_new', email: 'a@b.com' },
      include: { profile: true },
    });
    expect(result).toBe(created);
    expect(result.profile).toBeNull();
  });

  it('throws EmailConflictError when another live Clerk account owns the email', async () => {
    findUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'u_other',
      clerkId: 'clerk_other',
      email: 'a@b.com',
      profile: null,
    });
    getUserMock.mockResolvedValue({ id: 'clerk_other' });

    await expect(
      getOrCreateUserForClerk({
        clerkId: 'clerk_new',
        email: 'a@b.com',
      })
    ).rejects.toBeInstanceOf(EmailConflictError);

    expect(deleteLocalAccountDataMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});
