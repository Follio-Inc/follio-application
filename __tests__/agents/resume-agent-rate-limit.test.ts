import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetResumeAgentRateLimit,
  RESUME_AGENT_LIMITS,
  reserveResumeAgentRun,
} from '@/services/agents/resume/rate-limit';

const { agentRunCount } = vi.hoisted(() => ({ agentRunCount: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: { agentRun: { count: agentRunCount } } }));

beforeEach(() => {
  vi.clearAllMocks();
  __resetResumeAgentRateLimit();
  agentRunCount.mockResolvedValue(0);
});

describe('reserveResumeAgentRun — allowed', () => {
  it('admits a user with no history', async () => {
    const release = await reserveResumeAgentRun('u1');

    expect(typeof release).toBe('function');
    release();
  });

  it('counts finished runs for this user, this agent, over a rolling day', async () => {
    const before = Date.now();
    const release = await reserveResumeAgentRun('u1');
    release();

    const where = agentRunCount.mock.calls[0][0].where as {
      agentId: string;
      userId: string;
      startedAt: { gt: Date };
    };
    expect(where.agentId).toBe('resume-agent');
    expect(where.userId).toBe('u1');
    // Window opens roughly 24h ago.
    const windowMs = before - where.startedAt.gt.getTime();
    expect(windowMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(windowMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000);
  });

  it('admits the final run of the day', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns - 1);

    const release = await reserveResumeAgentRun('u1');
    release();
  });

  it('frees the slot again after release', async () => {
    const release = await reserveResumeAgentRun('u1');
    release();

    // Would throw on the concurrency cap if the slot were still held.
    const second = await reserveResumeAgentRun('u1');
    const third = await reserveResumeAgentRun('u1');
    second();
    third();
  });

  it('ignores a repeated release so one call cannot free another run slot', async () => {
    agentRunCount.mockResolvedValue(0);
    const first = await reserveResumeAgentRun('u1');
    const second = await reserveResumeAgentRun('u1');

    first();
    first();
    first();

    // Two concurrent slots exist; `second` still holds one, so only one is free.
    const third = await reserveResumeAgentRun('u1');
    await expect(reserveResumeAgentRun('u1')).rejects.toThrow(/already running/i);

    second();
    third();
  });
});

describe('reserveResumeAgentRun — blocked', () => {
  it('rejects once the daily total is reached', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);

    await expect(reserveResumeAgentRun('u1')).rejects.toThrow(/today's resume analyses/i);
  });

  it('returns a 429 AppError', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);

    await expect(reserveResumeAgentRun('u1')).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('does not leak a slot when the daily limit rejects', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns);
    await expect(reserveResumeAgentRun('u1')).rejects.toThrow();

    // The failed attempt must not still be counted as in flight.
    agentRunCount.mockResolvedValue(0);
    const release = await reserveResumeAgentRun('u1');
    const second = await reserveResumeAgentRun('u1');
    release();
    second();
  });

  it('does not leak a slot when the database lookup fails', async () => {
    agentRunCount.mockRejectedValue(new Error('db down'));
    await expect(reserveResumeAgentRun('u1')).rejects.toThrow(/db down/);

    agentRunCount.mockResolvedValue(0);
    const release = await reserveResumeAgentRun('u1');
    const second = await reserveResumeAgentRun('u1');
    release();
    second();
  });

  it('limits each user separately', async () => {
    agentRunCount.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === 'heavy' ? RESUME_AGENT_LIMITS.dailyRuns : 0)
    );

    await expect(reserveResumeAgentRun('heavy')).rejects.toThrow(/today/i);
    const release = await reserveResumeAgentRun('light');
    release();
  });
});

describe('reserveResumeAgentRun — concurrency', () => {
  it('counts an in-flight run against the daily total', async () => {
    agentRunCount.mockResolvedValue(RESUME_AGENT_LIMITS.dailyRuns - 1);

    const release = await reserveResumeAgentRun('u1');
    // 19 finished + 1 in flight already fills the day's 20.
    await expect(reserveResumeAgentRun('u1')).rejects.toThrow(/today's resume analyses/i);

    release();
  });

  it('caps simultaneous runs for one user', async () => {
    const held: Array<() => void> = [];
    for (let i = 0; i < RESUME_AGENT_LIMITS.maxConcurrent; i++) {
      held.push(await reserveResumeAgentRun('u1'));
    }

    await expect(reserveResumeAgentRun('u1')).rejects.toThrow(/already running/i);

    held.forEach((release) => release());
  });

  it('cannot be bypassed by firing requests simultaneously', async () => {
    // Every caller starts before any database count resolves, so a limiter
    // that only read persisted rows would admit all six.
    const pending: Array<(value: number) => void> = [];
    agentRunCount.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          pending.push(resolve);
        })
    );

    const attempts = Array.from({ length: 6 }, () => reserveResumeAgentRun('u1'));
    // Callers past the concurrency cap are refused synchronously and never
    // reach the database, so only the admitted ones have a pending count.
    pending.forEach((resolve) => resolve(0));
    const settled = await Promise.allSettled(attempts);

    const admitted = settled.filter((result) => result.status === 'fulfilled');
    const refused = settled.filter((result) => result.status === 'rejected');

    expect(admitted).toHaveLength(RESUME_AGENT_LIMITS.maxConcurrent);
    expect(refused).toHaveLength(6 - RESUME_AGENT_LIMITS.maxConcurrent);

    for (const result of admitted) {
      if (result.status === 'fulfilled') result.value();
    }
  });

  it('admits simultaneous runs for different users', async () => {
    const settled = await Promise.allSettled([
      reserveResumeAgentRun('a'),
      reserveResumeAgentRun('b'),
      reserveResumeAgentRun('c'),
    ]);

    expect(settled.every((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of settled) {
      if (result.status === 'fulfilled') result.value();
    }
  });
});
