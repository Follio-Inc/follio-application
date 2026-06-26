/**
 * Minimal Studio Template — Shared Utilities
 *
 * Self-contained helpers so the kit has no cross-template dependencies.
 */

/**
 * Format a date string to a human-readable "Mon YYYY" (or plain year).
 *
 * Month-precision dates are persisted as a UTC instant on the 1st of the
 * month, so we construct and format in UTC to keep the rendered month stable
 * regardless of the runtime timezone.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  try {
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [year, month] = dateStr.split('-');
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }

    if (/^\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

/** Format just the year from a date string. */
export function formatYear(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  const match = /^(\d{4})/.exec(dateStr);
  if (match) return match[1];
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return String(date.getUTCFullYear());
}

/** Format a date range for display, e.g. "Jan 2021 — Present". */
export function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  isCurrent: boolean
): string {
  const start = formatDate(startDate);
  const end = isCurrent ? 'Present' : formatDate(endDate);

  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} — ${end}`;
}

/** Format a year range for editorial lists, e.g. "2021 — 24". */
export function formatYearRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  isCurrent: boolean
): string {
  const start = formatYear(startDate);
  const end = isCurrent ? 'Now' : formatYear(endDate);

  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} — ${end}`;
}

/** Compute whole years since the earliest experience start. */
export function computeYearsOfExperience(
  experiences: Array<{ startDate: string | null; endDate: string | null; isCurrent: boolean }>
): number {
  if (experiences.length === 0) return 0;

  let earliestStart: Date | null = null;
  for (const exp of experiences) {
    if (!exp.startDate) continue;
    const date = new Date(exp.startDate);
    if (!isNaN(date.getTime()) && (!earliestStart || date < earliestStart)) {
      earliestStart = date;
    }
  }

  if (!earliestStart) return 0;
  const years = Math.floor((Date.now() - earliestStart.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.max(1, years);
}

/** Display name from first + last. */
export function getDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Anonymous';
}

/**
 * True when the URL points at a user-uploaded photo stored by Follio
 * (`/api/photos/{id}`). Social/Clerk avatars are excluded — they often
 * render as letter placeholders and are not portfolio uploads.
 */
export { isUploadedPhotoUrl } from '../media';

/** Zero-padded index, e.g. 1 → "01". */
export function pad2(n: number): string {
  return String(n + 1).padStart(2, '0');
}

/** Map a Follio link type to a known social icon key. */
export function getSocialIconType(linkType: string): string {
  switch (linkType.toUpperCase()) {
    case 'GITHUB':
      return 'github';
    case 'LINKEDIN':
      return 'linkedin';
    case 'TWITTER':
    case 'X':
      return 'twitter';
    case 'INSTAGRAM':
      return 'instagram';
    case 'YOUTUBE':
      return 'youtube';
    case 'BLOG':
    case 'MEDIUM':
      return 'blog';
    case 'DRIBBBLE':
      return 'dribbble';
    case 'BEHANCE':
      return 'behance';
    case 'EMAIL':
      return 'email';
    case 'PORTFOLIO':
    case 'WEBSITE':
      return 'website';
    default:
      return 'link';
  }
}
