import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'status' in error && 'errors' in error),
}));

const { findUniqueMock, updateMock, deleteMock, updateManyMock, transactionMock } = vi.hoisted(
  () => {
    const findUniqueMock = vi.fn();
    const updateMock = vi.fn();
    const deleteMock = vi.fn();
    const updateManyMock = vi.fn();
    const transactionMock = vi.fn();
    return { findUniqueMock, updateMock, deleteMock, updateManyMock, transactionMock };
  }
);

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
      delete: deleteMock,
    },
    agentRun: {
      updateMany: updateManyMock,
    },
    $transaction: transactionMock,
  },
}));

import {
  deleteAccountCompletely,
  deleteClerkAccount,
  deleteLocalAccountData,
} from '@/lib/account/delete-account';

describe('deleteClerkAccount', () => {
  it('deletes the Clerk user', async () => {
    const deleteClerkUser = vi.fn().mockResolvedValue(undefined);

    await deleteClerkAccount('clerk_123', deleteClerkUser);

    expect(deleteClerkUser).toHaveBeenCalledWith('clerk_123');
  });

  it('treats Clerk 404 as already deleted', async () => {
    const deleteClerkUser = vi.fn().mockRejectedValue({
      status: 404,
      errors: [{ code: 'resource_not_found' }],
    });

    await expect(deleteClerkAccount('clerk_123', deleteClerkUser)).resolves.toBeUndefined();
  });

  it('fails hard when Clerk deletion fails for other reasons', async () => {
    const deleteClerkUser = vi.fn().mockRejectedValue({
      status: 500,
      errors: [{ code: 'internal_error' }],
    });

    await expect(deleteClerkAccount('clerk_123', deleteClerkUser)).rejects.toMatchObject({
      name: 'AccountDeletionError',
      code: 'CLERK_DELETE_FAILED',
    });
  });
});

describe('deleteLocalAccountData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        user: { update: updateMock, delete: deleteMock },
        agentRun: { updateMany: updateManyMock },
      };
      return fn(tx);
    });
    updateMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ count: 0 });
    deleteMock.mockResolvedValue({});
  });

  it('disconnects profile pointers, clears agent runs, and deletes the user', async () => {
    await deleteLocalAccountData('user_1');

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        profile: { disconnect: true },
        primaryProfile: { disconnect: true },
      },
    });
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { userId: 'user_1' },
      data: { userId: null },
    });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'user_1' } });
  });

  it('wraps database failures', async () => {
    deleteMock.mockRejectedValue(new Error('fk constraint'));

    await expect(deleteLocalAccountData('user_1')).rejects.toMatchObject({
      name: 'AccountDeletionError',
      code: 'DATABASE_DELETE_FAILED',
    });
  });
});

describe('deleteAccountCompletely', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        user: { update: updateMock, delete: deleteMock },
        agentRun: { updateMany: updateManyMock },
      };
      return fn(tx);
    });
    updateMock.mockResolvedValue({});
    updateManyMock.mockResolvedValue({ count: 0 });
    deleteMock.mockResolvedValue({});
  });

  it('deletes Clerk first, then database data', async () => {
    const order: string[] = [];
    findUniqueMock.mockResolvedValue({ id: 'user_1' });
    const deleteClerkUser = vi.fn().mockImplementation(async () => {
      order.push('clerk');
    });
    deleteMock.mockImplementation(async () => {
      order.push('db');
      return {};
    });

    const result = await deleteAccountCompletely('clerk_123', deleteClerkUser);

    expect(order).toEqual(['clerk', 'db']);
    expect(result).toEqual({
      clerkDeleted: true,
      databaseDeleted: true,
      userId: 'user_1',
    });
  });

  it('still deletes Clerk when no local user row exists', async () => {
    findUniqueMock.mockResolvedValue(null);
    const deleteClerkUser = vi.fn().mockResolvedValue(undefined);

    const result = await deleteAccountCompletely('clerk_123', deleteClerkUser);

    expect(deleteClerkUser).toHaveBeenCalledWith('clerk_123');
    expect(deleteMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      clerkDeleted: true,
      databaseDeleted: false,
      userId: null,
    });
  });

  it('does not touch the database if Clerk deletion fails', async () => {
    findUniqueMock.mockResolvedValue({ id: 'user_1' });
    const deleteClerkUser = vi.fn().mockRejectedValue({
      status: 503,
      errors: [{ code: 'unavailable' }],
    });

    await expect(deleteAccountCompletely('clerk_123', deleteClerkUser)).rejects.toMatchObject({
      code: 'CLERK_DELETE_FAILED',
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
