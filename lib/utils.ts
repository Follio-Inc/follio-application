/**
 * Utility Functions
 * Common helpers used throughout the application
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date for display
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', options ?? { month: 'short', year: 'numeric' });
}

/**
 * Format a date range (e.g., "Jan 2020 - Present")
 */
export function formatDateRange(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  isCurrent?: boolean
): string {
  const start = formatDate(startDate);
  const end = isCurrent ? 'Present' : formatDate(endDate);
  if (!start) return '';
  return `${start} - ${end}`;
}

/**
 * Calculate duration between two dates
 */
export function calculateDuration(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  isCurrent?: boolean
): string {
  if (!startDate) return '';

  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end =
    isCurrent || !endDate ? new Date() : typeof endDate === 'string' ? new Date(endDate) : endDate;

  const months = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (years === 0) return `${months} mo`;
  if (remainingMonths === 0) return `${years} yr`;
  return `${years} yr ${remainingMonths} mo`;
}

/**
 * Generate a URL-safe handle from a name
 */
export function generateHandle(firstName: string, lastName?: string): string {
  const name = lastName ? `${firstName} ${lastName}` : firstName;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/**
 * Validate a handle format
 */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Format a number with K/M suffix
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Generate a random token
 */
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Delay execution (useful for loading states in dev)
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if we're running on the server
 */
export const isServer = typeof window === 'undefined';

/**
 * Get the base URL for the application
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/**
 * Construct a full URL
 */
export function absoluteUrl(path: string): string {
  return `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

// ============================================================================
// DATE PARSING UTILITIES
// ============================================================================

/**
 * Month name to 0-indexed month number mapping
 */
const MONTH_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Robust date parser that handles multiple formats:
 * - YYYY-MM (HTML month input format, e.g., "2024-01")
 * - "Month Year" (e.g., "Jan 2024", "January 2024")
 * - "Year Month" (e.g., "2024 Jan")
 * - MM/YYYY or MM-YYYY (e.g., "01/2024")
 * - ISO format (e.g., "2024-01-15")
 * - Just year (e.g., "2024")
 *
 * Returns null for invalid dates or "Present"/"Current" strings
 */
export function parseDateFlexible(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;

  const str = dateStr.toString().trim();
  if (!str) return null;

  // Handle "Present", "Current", etc.
  if (/^(present|current|now|ongoing)$/i.test(str)) {
    return null;
  }

  // Try YYYY-MM format (from HTML month input)
  const yyyyMMMatch = str.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMMMatch) {
    const year = parseInt(yyyyMMMatch[1], 10);
    const month = parseInt(yyyyMMMatch[2], 10) - 1;
    if (year >= 1950 && year <= 2100 && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }

  // Try "Month Year" format (e.g., "Jan 2024", "January 2024")
  const monthYearMatch = str.match(/^([a-zA-Z]+)\s*[\s,.-]*\s*(\d{4})$/);
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2], 10);
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && year >= 1950 && year <= 2100) {
      return new Date(year, month, 1);
    }
  }

  // Try "Year Month" format (e.g., "2024 Jan")
  const yearMonthMatch = str.match(/^(\d{4})\s*[\s,.-]*\s*([a-zA-Z]+)$/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const monthKey = yearMonthMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && year >= 1950 && year <= 2100) {
      return new Date(year, month, 1);
    }
  }

  // Try MM/YYYY or MM-YYYY format
  const mmYYYYMatch = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmYYYYMatch) {
    const month = parseInt(mmYYYYMatch[1], 10) - 1;
    const year = parseInt(mmYYYYMatch[2], 10);
    if (year >= 1950 && year <= 2100 && month >= 0 && month <= 11) {
      return new Date(year, month, 1);
    }
  }

  // Just a year (e.g., "2024")
  const yearOnlyMatch = str.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    if (year >= 1950 && year <= 2100) {
      return new Date(year, 0, 1);
    }
  }

  // Fall back to standard Date parsing
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year >= 1950 && year <= 2100) {
        return date;
      }
    }
  } catch {
    // Ignore parsing errors
  }

  return null;
}

/**
 * Convert various date formats to YYYY-MM format for HTML month inputs.
 * Handles: "Jan 2024", "January 2024", "2024-01", "01/2024", "2024", etc.
 * Returns empty string for invalid dates or "Present"/"Current" strings.
 */
export function toMonthInputFormat(dateStr: string | undefined | null): string {
  if (!dateStr) return '';

  const str = dateStr.toString().trim();

  // Already in YYYY-MM format
  if (/^\d{4}-\d{2}$/.test(str)) {
    return str;
  }

  // Handle "Present", "Current", etc.
  if (/^(present|current|now|ongoing)$/i.test(str)) {
    return '';
  }

  // Try to parse the date
  const date = parseDateFlexible(str);
  if (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  return '';
}
