import { describe, expect, it } from 'vitest';

import {
  hasEntryFormChanges,
  stableFormSnapshot,
} from '@/app/(dashboard)/builder/lib/entry-edit-guard';

describe('entry edit guard snapshots', () => {
  it('treats empty string and undefined as equivalent', () => {
    expect(hasEntryFormChanges({ role: '' }, { role: undefined })).toBe(false);
  });

  it('detects real field changes', () => {
    expect(hasEntryFormChanges({ role: 'Engineer' }, { role: 'Designer' })).toBe(true);
  });

  it('normalizes Date values for comparison', () => {
    const a = { startDate: new Date('2024-01-01T00:00:00.000Z') };
    const b = { startDate: new Date('2024-01-01T00:00:00.000Z') };
    expect(stableFormSnapshot(a)).toBe(stableFormSnapshot(b));
    expect(hasEntryFormChanges(a, b)).toBe(false);
  });

  it('detects date changes', () => {
    expect(
      hasEntryFormChanges(
        { startDate: new Date('2024-01-01T00:00:00.000Z') },
        { startDate: new Date('2025-01-01T00:00:00.000Z') }
      )
    ).toBe(true);
  });
});
