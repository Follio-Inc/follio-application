import { describe, expect, it } from 'vitest';

import {
  RESUME_CONSTRUCTION_HARD_DISMISS_MS,
  RESUME_CONSTRUCTION_REFRESH_HINT_MS,
  RESUME_CONSTRUCTION_REVEAL_MS,
  RESUME_CONSTRUCTION_SESSION_KEY,
  RESUME_CONSTRUCTION_SESSION_PLAYING,
  RESUME_CONSTRUCTION_STATUSES,
} from '@/lib/onboarding/resume-construction';

describe('resume construction handoff', () => {
  it('exposes a stable session key and staged status copy', () => {
    expect(RESUME_CONSTRUCTION_SESSION_KEY).toBe('follio_resume_construct');
    expect(RESUME_CONSTRUCTION_SESSION_PLAYING).toBe('playing');
    expect(RESUME_CONSTRUCTION_STATUSES.length).toBeGreaterThanOrEqual(3);
    expect(RESUME_CONSTRUCTION_STATUSES[0]).toMatch(/Reading/i);
  });

  it('keeps the reveal short so the resume feels instant', () => {
    expect(RESUME_CONSTRUCTION_REVEAL_MS).toBeLessThanOrEqual(1000);
    expect(RESUME_CONSTRUCTION_REFRESH_HINT_MS).toBeGreaterThan(RESUME_CONSTRUCTION_REVEAL_MS);
    expect(RESUME_CONSTRUCTION_HARD_DISMISS_MS).toBeGreaterThan(
      RESUME_CONSTRUCTION_REFRESH_HINT_MS
    );
  });
});
