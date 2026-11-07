/**
 * Career tenure shown as a tag on the Experience header (resume + Follio).
 *
 * Calculated from visible role dates, merging overlapping / back-to-back jobs
 * so concurrent roles are not double-counted. A stored override wins when set.
 *
 * Display is years only, or years and leftover months. Under a year always
 * shows months only — never "0 yrs".
 */

export type ExperienceDateRange = {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  isCurrent?: boolean | null;
  isVisible?: boolean | null;
};

/** Stored preference. Null = years only (under a year still displays months). */
export type TotalExperienceUnits = {
  showYears?: boolean | null;
  showMonths?: boolean | null;
};

export type ResolvedTotalExperienceUnits = {
  showYears: boolean;
  showMonths: boolean;
};

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function formatYearPart(years: number): string {
  return `${years} ${years === 1 ? 'yr' : 'yrs'}`;
}

function formatMonthPart(months: number): string {
  return `${months} ${months === 1 ? 'mo' : 'mos'}`;
}

/** Inclusive elapsed months, matching per-role tenure (Jan–Dec = 12 months). */
export function inclusiveMonthCount(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent: boolean
): number | null {
  const from = parseDate(start);
  if (!from) return null;
  const to = isCurrent || !end ? new Date() : parseDate(end);
  if (!to || to < from) return null;
  const months = monthIndex(to) - monthIndex(from) + 1;
  return months < 1 ? null : months;
}

/** "2 yrs 1 mo" / "8 mos". Null for anything under a month. Never "0 yrs". */
export function formatTenureMonths(months: number | null | undefined): string | null {
  if (months == null || months < 1) return null;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(formatYearPart(years));
  if (remMonths > 0) parts.push(formatMonthPart(remMonths));
  return parts.join(' ') || null;
}

/** Years-only at 1 year or more; months-only under a year. */
export function defaultTotalExperienceUnits(
  months: number | null | undefined
): ResolvedTotalExperienceUnits {
  if (months != null && months < 12) {
    return { showYears: false, showMonths: true };
  }
  return { showYears: true, showMonths: false };
}

/** Years + leftover months when the user opted in; otherwise years only. */
export function preferenceTotalExperienceUnits(
  stored?: TotalExperienceUnits | null
): ResolvedTotalExperienceUnits {
  return { showYears: true, showMonths: stored?.showMonths === true };
}

/** Apply stored preference. Under a year defaults to months only. */
export function resolveTotalExperienceUnits(
  months: number | null | undefined,
  stored?: TotalExperienceUnits | null
): ResolvedTotalExperienceUnits {
  if (months != null && months < 12) {
    return { showYears: false, showMonths: stored?.showMonths ?? true };
  }
  return preferenceTotalExperienceUnits(stored);
}

export function unitsFromProfile(profile: {
  totalExperienceShowYears?: boolean | null;
  totalExperienceShowMonths?: boolean | null;
}): TotalExperienceUnits {
  return {
    showYears: profile.totalExperienceShowYears,
    showMonths: profile.totalExperienceShowMonths,
  };
}

/**
 * Total-experience tag. Under a year is always months. At 1 year+ the user
 * chooses years only or years and leftover months. Never "0 yrs".
 */
export function formatTotalExperience(
  months: number | null | undefined,
  units?: TotalExperienceUnits | null
): string | null {
  if (months == null || months < 1) return null;
  const { showMonths } = resolveTotalExperienceUnits(months, units);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return showMonths ? formatMonthPart(months) : null;
  if (showMonths && remMonths > 0) {
    return `${formatYearPart(years)} ${formatMonthPart(remMonths)}`;
  }
  return formatYearPart(years);
}

function rangeOf(experience: ExperienceDateRange): { start: number; end: number } | null {
  if (experience.isVisible === false) return null;
  const from = parseDate(experience.startDate);
  if (!from) return null;
  const to =
    experience.isCurrent || !experience.endDate ? new Date() : parseDate(experience.endDate);
  if (!to || to < from) return null;
  return { start: monthIndex(from), end: monthIndex(to) };
}

/** Union of visible role ranges in inclusive months. Concurrent jobs count once. */
export function calculateTotalExperienceMonths(experiences: ExperienceDateRange[]): number | null {
  const ranges = experiences
    .map(rangeOf)
    .filter((range): range is { start: number; end: number } => range !== null);
  if (ranges.length === 0) return null;

  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end + 1) {
      merged.push({ start: range.start, end: range.end });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  const months = merged.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
  return months < 1 ? null : months;
}

/**
 * Union of visible role date ranges, formatted for the Experience header tag.
 * Concurrent jobs count once; career gaps are not included.
 */
export function calculateTotalExperience(
  experiences: ExperienceDateRange[],
  units?: TotalExperienceUnits | null
): string | null {
  return formatTotalExperience(calculateTotalExperienceMonths(experiences), units);
}

function formatNumericOverride(
  override: string,
  units?: TotalExperienceUnits | null
): string | null | undefined {
  const match = override.match(/^(?:(\d+)\s+yrs?(?:\s+(\d+)\s+mos?)?|(\d+)\s+mos?)$/i);
  if (!match) return undefined;
  return formatTotalExperience(
    Number(match[1] ?? 0) * 12 + Number(match[2] ?? match[3] ?? 0),
    units
  );
}

/** Stored override if the user typed one; otherwise the calculated label. */
export function resolveTotalExperience(
  override: string | null | undefined,
  experiences: ExperienceDateRange[],
  units?: TotalExperienceUnits | null
): string | null {
  const trimmed = override?.trim();
  if (trimmed) {
    const formatted = formatNumericOverride(trimmed, units);
    return formatted === undefined ? trimmed : formatted;
  }
  return calculateTotalExperience(experiences, units);
}

/** Persist null when the typed value is empty or still matches the calculation. */
export function normalizeTotalExperienceOverride(
  raw: string | null | undefined,
  experiences: ExperienceDateRange[],
  units?: TotalExperienceUnits | null
): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  const calculated = calculateTotalExperience(experiences, units);
  return trimmed === calculated ? null : trimmed;
}

/** Label for the Experience header tag, or null when the user hid it. */
export function displayTotalExperience(
  override: string | null | undefined,
  experiences: ExperienceDateRange[],
  visible: boolean | null | undefined = true,
  units?: TotalExperienceUnits | null
): string | null {
  if (visible === false) return null;
  return resolveTotalExperience(override, experiences, units);
}
