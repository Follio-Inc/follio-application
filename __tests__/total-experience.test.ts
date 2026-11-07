import { describe, expect, it } from 'vitest';

import {
  calculateTotalExperience,
  defaultTotalExperienceUnits,
  displayTotalExperience,
  formatTenureMonths,
  formatTotalExperience,
  inclusiveMonthCount,
  normalizeTotalExperienceOverride,
  preferenceTotalExperienceUnits,
  resolveTotalExperience,
  resolveTotalExperienceUnits,
} from '@/lib/total-experience';

describe('inclusiveMonthCount', () => {
  it('counts Jan–Dec as a full year', () => {
    expect(inclusiveMonthCount('2020-01-01', '2020-12-01', false)).toBe(12);
  });

  it('returns null for missing or reversed dates', () => {
    expect(inclusiveMonthCount(null, '2020-12-01', false)).toBeNull();
    expect(inclusiveMonthCount('2024-01-01', '2020-01-01', false)).toBeNull();
  });
});

describe('formatTenureMonths', () => {
  it('formats years and leftover months', () => {
    expect(formatTenureMonths(12)).toBe('1 yr');
    expect(formatTenureMonths(26)).toBe('2 yrs 2 mos');
    expect(formatTenureMonths(3)).toBe('3 mos');
    expect(formatTenureMonths(0)).toBeNull();
  });
});

describe('formatTotalExperience', () => {
  it('defaults to years only at 1 year or more', () => {
    expect(formatTotalExperience(12)).toBe('1 yr');
    expect(formatTotalExperience(26)).toBe('2 yrs');
  });

  it('defaults to months only under a year and never says 0 years', () => {
    expect(formatTotalExperience(3)).toBe('3 mos');
    expect(formatTotalExperience(11)).toBe('11 mos');
    expect(formatTotalExperience(8, { showYears: true, showMonths: true })).toBe('8 mos');
  });

  it('hides months when the month toggle is off', () => {
    expect(formatTotalExperience(8, { showMonths: false })).toBeNull();
    expect(formatTotalExperience(26, { showMonths: false })).toBe('2 yrs');
  });

  it('includes leftover months when years and months are on', () => {
    expect(formatTotalExperience(26, { showYears: true, showMonths: true })).toBe('2 yrs 2 mos');
  });

  it('treats showMonths as the only user preference at 1 year or more', () => {
    expect(formatTotalExperience(26, { showYears: false, showMonths: true })).toBe('2 yrs 2 mos');
    expect(formatTotalExperience(26, { showYears: false, showMonths: false })).toBe('2 yrs');
  });
});

describe('resolveTotalExperienceUnits', () => {
  it('uses years-only at 1 year or more and months-only under a year', () => {
    expect(defaultTotalExperienceUnits(12)).toEqual({ showYears: true, showMonths: false });
    expect(defaultTotalExperienceUnits(8)).toEqual({ showYears: false, showMonths: true });
  });

  it('keeps an explicit user choice', () => {
    expect(resolveTotalExperienceUnits(26, { showYears: true, showMonths: true })).toEqual({
      showYears: true,
      showMonths: true,
    });
  });

  it('maps the stored preference to years or years and months', () => {
    expect(preferenceTotalExperienceUnits({ showMonths: true })).toEqual({
      showYears: true,
      showMonths: true,
    });
    expect(resolveTotalExperienceUnits(26, { showYears: false, showMonths: false })).toEqual({
      showYears: true,
      showMonths: false,
    });
  });
});

describe('calculateTotalExperience', () => {
  it('returns null when there are no dated roles', () => {
    expect(calculateTotalExperience([])).toBeNull();
    expect(
      calculateTotalExperience([{ startDate: null, endDate: null, isCurrent: false }])
    ).toBeNull();
  });

  it('formats a single role', () => {
    expect(
      calculateTotalExperience([
        { startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false },
      ])
    ).toBe('3 yrs');
  });

  it('does not double-count overlapping jobs', () => {
    expect(
      calculateTotalExperience([
        { startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false },
        { startDate: '2022-06-01', endDate: '2024-06-01', isCurrent: false },
      ])
    ).toBe('4 yrs');
  });

  it('can show leftover months when asked', () => {
    expect(
      calculateTotalExperience(
        [
          { startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false },
          { startDate: '2022-06-01', endDate: '2024-06-01', isCurrent: false },
        ],
        { showYears: true, showMonths: true }
      )
    ).toBe('4 yrs 6 mos');
  });

  it('merges back-to-back months and skips career gaps', () => {
    expect(
      calculateTotalExperience([
        { startDate: '2020-01-01', endDate: '2020-12-01', isCurrent: false },
        { startDate: '2021-01-01', endDate: '2021-12-01', isCurrent: false },
      ])
    ).toBe('2 yrs');

    expect(
      calculateTotalExperience([
        { startDate: '2020-01-01', endDate: '2020-06-01', isCurrent: false },
        { startDate: '2021-01-01', endDate: '2021-06-01', isCurrent: false },
      ])
    ).toBe('1 yr');
  });

  it('ignores hidden roles', () => {
    expect(
      calculateTotalExperience([
        { startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false, isVisible: false },
        { startDate: '2023-01-01', endDate: '2023-12-01', isCurrent: false },
      ])
    ).toBe('1 yr');
  });
});

describe('resolveTotalExperience', () => {
  const roles = [{ startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false }];

  it('uses the calculated label when no override is stored', () => {
    expect(resolveTotalExperience(null, roles)).toBe('3 yrs');
    expect(resolveTotalExperience('  ', roles)).toBe('3 yrs');
  });

  it('prefers a user-edited override', () => {
    expect(resolveTotalExperience('5+ years', roles)).toBe('5+ years');
  });

  it('applies the month toggle to numeric overrides', () => {
    expect(resolveTotalExperience('2 yrs 2 mos', roles, { showMonths: false })).toBe('2 yrs');
    expect(resolveTotalExperience('8 mos', roles, { showMonths: false })).toBeNull();
  });
});

describe('displayTotalExperience', () => {
  const roles = [{ startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false }];

  it('hides the tag when visibility is off', () => {
    expect(displayTotalExperience('5+ years', roles, false)).toBeNull();
  });

  it('shows the resolved label when visible', () => {
    expect(displayTotalExperience(null, roles, true)).toBe('3 yrs');
  });
});

describe('normalizeTotalExperienceOverride', () => {
  const roles = [{ startDate: '2020-01-01', endDate: '2022-12-01', isCurrent: false }];

  it('stores null when the field is cleared or still matches the calculation', () => {
    expect(normalizeTotalExperienceOverride('', roles)).toBeNull();
    expect(normalizeTotalExperienceOverride('3 yrs', roles)).toBeNull();
  });

  it('keeps a custom label', () => {
    expect(normalizeTotalExperienceOverride(' 5+ years ', roles)).toBe('5+ years');
  });
});
