import { describe, expect, it } from 'vitest';

import { formatAtelierYearRange } from '@/lib/resume/atelier';

describe('atelier helpers', () => {
  it('formats year-only date ranges', () => {
    expect(formatAtelierYearRange(new Date(2018, 5, 1), new Date(2021, 2, 1))).toBe('2018 - 2021');
    expect(formatAtelierYearRange(new Date(2020, 0, 1), null, true)).toBe('2020 - Present');
  });
});
