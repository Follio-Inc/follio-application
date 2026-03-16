/**
 * Developer Dark Template — Shared Utilities
 *
 * Helper functions and constants shared across all template sections.
 */

/**
 * Format a date string to a human-readable format.
 * Handles ISO strings, "YYYY-MM" formats, and plain years.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  try {
    // Handle "YYYY-MM" format
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [year, month] = dateStr.split('-');
      const date = new Date(Number(year), Number(month) - 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    // Handle plain year
    if (/^\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    // Handle ISO or other parseable date strings
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Format a date range for display.
 */
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

/**
 * Compute years of experience from work experiences.
 */
export function computeYearsOfExperience(
  experiences: Array<{ startDate: string | null; endDate: string | null; isCurrent: boolean }>
): number {
  if (experiences.length === 0) return 0;

  let earliestStart: Date | null = null;

  for (const exp of experiences) {
    if (!exp.startDate) continue;
    try {
      const date = new Date(exp.startDate);
      if (!isNaN(date.getTime())) {
        if (!earliestStart || date < earliestStart) {
          earliestStart = date;
        }
      }
    } catch {
      // skip
    }
  }

  if (!earliestStart) return 0;
  const years = Math.floor((Date.now() - earliestStart.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return Math.max(1, years);
}

/**
 * Get a display name from first + last name.
 */
export function getDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Anonymous';
}

/**
 * Map link type to a section ID for smooth scrolling.
 */
export function getSocialIconType(linkType: string): string {
  const type = linkType.toUpperCase();
  switch (type) {
    case 'GITHUB':
      return 'github';
    case 'LINKEDIN':
      return 'linkedin';
    case 'TWITTER':
      return 'twitter';
    case 'YOUTUBE':
      return 'youtube';
    case 'BLOG':
      return 'blog';
    case 'DRIBBBLE':
      return 'dribbble';
    case 'BEHANCE':
      return 'behance';
    case 'PORTFOLIO':
    case 'WEBSITE':
      return 'website';
    default:
      return 'link';
  }
}
