import { describe, expect, it, vi } from 'vitest';

import {
  buildDatasourceUrl,
  isNeonPooledUrl,
  isRetryablePrismaError,
  withPrismaRetry,
} from '@/lib/prisma-connection';

describe('isNeonPooledUrl', () => {
  it('detects Neon pooler hosts', () => {
    expect(
      isNeonPooledUrl(
        'postgresql://u:p@ep-abc-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
      )
    ).toBe(true);
  });

  it('is false for local Docker Postgres', () => {
    expect(isNeonPooledUrl('postgresql://postgres:postgres@localhost:5432/follio')).toBe(false);
  });
});

describe('buildDatasourceUrl', () => {
  it('returns empty input unchanged', () => {
    expect(buildDatasourceUrl('')).toBe('');
  });

  it('adds local pool defaults without duplicating an existing query', () => {
    const url = buildDatasourceUrl('postgresql://postgres:postgres@localhost:5432/follio');
    expect(url).toContain('connection_limit=10');
    expect(url).toContain('pool_timeout=20');
    expect(url).toContain('connect_timeout=10');
    expect(url).not.toContain('pgbouncer');
  });

  it('does not override params already in DATABASE_URL', () => {
    const url = buildDatasourceUrl(
      'postgresql://postgres:postgres@localhost:5432/follio?connection_limit=3&pool_timeout=15'
    );
    expect(url).toContain('connection_limit=3');
    expect(url).toContain('pool_timeout=15');
    expect(url).toContain('connect_timeout=10');
    expect(url.match(/connection_limit=/g)).toHaveLength(1);
    expect(url.match(/pool_timeout=/g)).toHaveLength(1);
  });

  it('keeps Neon pooler limit low and enables pgbouncer', () => {
    const url = buildDatasourceUrl(
      'postgresql://u:p@ep-abc-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
    );
    expect(url).toContain('connection_limit=5');
    expect(url).toContain('pgbouncer=true');
    expect(url).toContain('sslmode=require');
  });
});

describe('isRetryablePrismaError', () => {
  it('retries pool timeouts even for writes', () => {
    expect(isRetryablePrismaError({ code: 'P2024', message: 'pool timeout' }, 'create')).toBe(true);
  });

  it('retries unreachable-server codes', () => {
    expect(isRetryablePrismaError({ code: 'P1001', message: "Can't reach database server" })).toBe(
      true
    );
  });

  it('retries closed connections on reads only', () => {
    const closed = { code: 'P1017', message: 'Server has closed the connection' };
    expect(isRetryablePrismaError(closed, 'findUnique')).toBe(true);
    expect(isRetryablePrismaError(closed, 'create')).toBe(false);
  });

  it('does not retry unique-constraint failures', () => {
    expect(isRetryablePrismaError({ code: 'P2002', message: 'Unique constraint' }, 'create')).toBe(
      false
    );
  });

  it('retries pool-timeout wording without a Prisma code', () => {
    expect(
      isRetryablePrismaError(
        new Error('Timed out fetching a new connection from the connection pool'),
        'findUnique'
      )
    ).toBe(true);
  });
});

describe('withPrismaRetry', () => {
  it('returns on the first success', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    await expect(
      withPrismaRetry(run, 'findUnique', { sleep: async () => undefined })
    ).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a pool timeout then succeeds', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce({ code: 'P2024', message: 'Timed out fetching a new connection' })
      .mockResolvedValueOnce({ id: 'p1' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withPrismaRetry(run, 'findUnique', { sleep })).resolves.toEqual({ id: 'p1' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry a unique constraint error', async () => {
    const error = { code: 'P2002', message: 'Unique constraint' };
    const run = vi.fn().mockRejectedValue(error);

    await expect(withPrismaRetry(run, 'create', { sleep: async () => undefined })).rejects.toBe(
      error
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const error = { code: 'P2024', message: 'pool timeout' };
    const run = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withPrismaRetry(run, 'findUnique', { maxAttempts: 3, sleep })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
