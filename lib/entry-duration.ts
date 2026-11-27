/**
 * Per-entry tenure shown as a tag on the company / institution subheading.
 *
 * Calculated from the same start–end dates already on the row. Hidden unless
 * the user turns it on — dates already communicate the range, so this is not
 * recommended on a resume.
 */

import { formatTenureMonths, inclusiveMonthCount } from '@/lib/total-experience';

export type EntryDateRange = {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  isCurrent?: boolean | null;
  durationVisible?: boolean | null;
};

/** "2 yrs 1 mo" / "8 mos". Null when dates are missing or under a month. */
export function formatEntryDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent?: boolean | null
): string | null {
  return formatTenureMonths(inclusiveMonthCount(start, end, isCurrent === true));
}

/** Resume / export label. Null unless the user opted in. */
export function displayEntryDuration(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  isCurrent?: boolean | null,
  visible?: boolean | null
): string | null {
  if (visible !== true) return null;
  return formatEntryDuration(start, end, isCurrent);
}

export function displayEntryDurationFrom(entry: EntryDateRange): string | null {
  return displayEntryDuration(
    entry.startDate,
    entry.endDate,
    entry.isCurrent,
    entry.durationVisible
  );
}

export function wrapEntrySubtitleHtml(
  subtitleHtml: string,
  duration: string | null,
  escape: (value: string) => string
): string {
  if (!duration) return subtitleHtml;
  const tag = `<span class="resume-section-tag">${escape(duration)}</span>`;
  if (!subtitleHtml) return `<div class="resume-entry-subtitle-row">${tag}</div>`;
  return `<div class="resume-entry-subtitle-row">${subtitleHtml}${tag}</div>`;
}
