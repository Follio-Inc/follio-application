/**
 * Background resume refresh — failures must not escape as unhandled.
 *
 * `scheduleResumeRefresh` exists to do work *after* the response, so nothing
 * awaits it. That is the point, and it is also the hazard: a promise nobody
 * awaits and nobody catches rejects into the process, not into the request
 * that caused it. Node prints those on stderr with no useful attribution, and
 * some runtimes treat an unhandled rejection as fatal.
 *
 * The merge surfaced this as `EnvironmentTeardownError` escaping a route test,
 * which was the same defect wearing a test-runner costume: the refresh's
 * dynamic imports outlived the test, rejected, and had no handler.
 *
 * These tests drive the real function with the real `after` seam and the real
 * services replaced, and assert the property directly: whatever the refresh
 * does, nothing reaches the process as an unhandled rejection, and the caller
 * is never made to wait or to fail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const afterMock = vi.fn();
const refreshResumeGlanceMock = vi.fn();
const refreshResumeSkillProfileMock = vi.fn();
const warnMock = vi.fn();

vi.mock('next/server', () => ({
  after: (callback: () => void) => afterMock(callback),
}));

vi.mock('@/services/resume-glance.service', () => ({
  refreshResumeGlance: (...args: unknown[]) => refreshResumeGlanceMock(...args),
}));

vi.mock('@/services/resume-skill-profile.service', () => ({
  refreshResumeSkillProfile: (...args: unknown[]) => refreshResumeSkillProfileMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ warn: (...args: unknown[]) => warnMock(...args) }) },
}));

import { scheduleResumeRefresh, scheduleSkillProfileRefresh } from '@/lib/resume/schedule-refresh';

const PROFILE_ID = 'resume_1';

/** Rejections that reach the process rather than a handler. */
let unhandled: unknown[] = [];

function recordUnhandled(reason: unknown): void {
  unhandled.push(reason);
}

/** Let every queued microtask and the detached chain settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  unhandled = [];
  process.on('unhandledRejection', recordUnhandled);
  // The default seam: `after` runs its callback immediately, which is what a
  // request scope eventually does.
  afterMock.mockImplementation((callback: () => void) => callback());
  refreshResumeGlanceMock.mockResolvedValue(undefined);
  refreshResumeSkillProfileMock.mockResolvedValue(undefined);
});

afterEach(() => {
  process.off('unhandledRejection', recordUnhandled);
});

// ============================================================================

describe('scheduling runs the work without making the caller wait', () => {
  it('returns nothing and schedules through `after`', async () => {
    expect(scheduleResumeRefresh(PROFILE_ID)).toBeUndefined();

    expect(afterMock).toHaveBeenCalledTimes(1);
    await settle();
    expect(refreshResumeGlanceMock).toHaveBeenCalledWith(PROFILE_ID);
    expect(refreshResumeSkillProfileMock).toHaveBeenCalledWith(PROFILE_ID);
  });

  it('still runs the work when there is no request scope', async () => {
    // `after` throws outside a request — a script, a test, a non-request code
    // path. The refresh should happen anyway rather than being dropped.
    afterMock.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });

    expect(() => scheduleResumeRefresh(PROFILE_ID)).not.toThrow();
    await settle();

    expect(refreshResumeGlanceMock).toHaveBeenCalledWith(PROFILE_ID);
    expect(unhandled).toEqual([]);
  });

  it('does nothing without a profile id', async () => {
    for (const id of [null, undefined, '']) {
      scheduleResumeRefresh(id);
    }
    await settle();

    expect(afterMock).not.toHaveBeenCalled();
    expect(refreshResumeGlanceMock).not.toHaveBeenCalled();
  });
});

// ============================================================================

describe('a failing refresh is recorded, not thrown into the process', () => {
  it('handles one of the two rejecting', async () => {
    refreshResumeGlanceMock.mockRejectedValue(new Error('database is away'));

    expect(() => scheduleResumeRefresh(PROFILE_ID)).not.toThrow();
    await settle();

    expect(unhandled).toEqual([]);
    expect(warnMock).toHaveBeenCalled();
    expect(JSON.stringify(warnMock.mock.calls)).toContain('database is away');
  });

  it('handles both rejecting', async () => {
    // With `Promise.all` the second rejection would arrive after the combined
    // promise had already settled on the first, leaving it unhandled. This is
    // the case that regression-tests the use of `allSettled`.
    refreshResumeGlanceMock.mockRejectedValue(new Error('glance failed'));
    refreshResumeSkillProfileMock.mockRejectedValue(new Error('skills failed'));

    scheduleResumeRefresh(PROFILE_ID);
    await settle();

    expect(unhandled).toEqual([]);
    const logged = JSON.stringify(warnMock.mock.calls);
    expect(logged).toContain('glance failed');
    expect(logged).toContain('skills failed');
  });

  it('still refreshes the other read when one fails', async () => {
    refreshResumeGlanceMock.mockRejectedValue(new Error('glance failed'));

    scheduleResumeRefresh(PROFILE_ID);
    await settle();

    // A failure in one must not cancel the other; both were already started.
    expect(refreshResumeSkillProfileMock).toHaveBeenCalledWith(PROFILE_ID);
  });

  it('handles a rejection thrown with a non-Error value', async () => {
    refreshResumeSkillProfileMock.mockRejectedValue('just a string');

    scheduleResumeRefresh(PROFILE_ID);
    await settle();

    expect(unhandled).toEqual([]);
    expect(JSON.stringify(warnMock.mock.calls)).toContain('just a string');
  });

  it('never surfaces a resume id as the error itself', async () => {
    // The log carries the id as context; the message is the failure.
    refreshResumeGlanceMock.mockRejectedValue(new Error('timeout'));

    scheduleResumeRefresh(PROFILE_ID);
    await settle();

    const [, context] = warnMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(context.profileId).toBe(PROFILE_ID);
    expect(context.error).toBe('timeout');
  });
});

// ============================================================================

describe('the skill-only scheduler behaves the same way', () => {
  it('runs the skill refresh and nothing else', async () => {
    scheduleSkillProfileRefresh(PROFILE_ID);
    await settle();

    expect(refreshResumeSkillProfileMock).toHaveBeenCalledWith(PROFILE_ID);
    expect(refreshResumeGlanceMock).not.toHaveBeenCalled();
  });

  it('handles a rejection without it escaping', async () => {
    refreshResumeSkillProfileMock.mockRejectedValue(new Error('skills failed'));

    expect(() => scheduleSkillProfileRefresh(PROFILE_ID)).not.toThrow();
    await settle();

    expect(unhandled).toEqual([]);
    expect(JSON.stringify(warnMock.mock.calls)).toContain('skills failed');
  });

  it('handles a throwing `after` without losing the work', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('no request scope');
    });

    expect(() => scheduleSkillProfileRefresh(PROFILE_ID)).not.toThrow();
    await settle();

    expect(refreshResumeSkillProfileMock).toHaveBeenCalledWith(PROFILE_ID);
    expect(unhandled).toEqual([]);
  });
});
