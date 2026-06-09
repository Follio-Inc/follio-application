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
 * Format a date for display.
 *
 * Resume/profile dates (work experience, education, certifications, etc.) are
 * month-precision values that we persist as a UTC instant at midnight on the
 * 1st of the month — e.g. "March 2024" is stored as `2024-03-01T00:00:00.000Z`.
 * They represent a calendar month, NOT a moment in time, so they must be
 * formatted in UTC. Formatting them in the runtime's local timezone causes the
 * rendered month to silently shift by one whenever that timezone differs from
 * UTC — for example the user's browser during live preview versus the server
 * during PDF export. Anchoring formatting to UTC guarantees the displayed month
 * always equals the stored month, on every device, server, and locale.
 *
 * Callers may override `timeZone` via `options` when formatting a true instant.
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  });
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
 * Generate a cryptographically secure random token.
 * Uses Web Crypto API (available in Node 19+ and all modern browsers).
 * Falls back to Node.js `crypto` module in server environments.
 */
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint32Array(length);

  // Use Web Crypto API (works in both browser and Node 19+/Edge runtime)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    // Fallback for older Node.js environments
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const buf = nodeCrypto.randomBytes(length * 4);
    for (let i = 0; i < length; i++) {
      randomValues[i] = buf.readUInt32BE(i * 4);
    }
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
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
 * Month-precision inputs are anchored to midnight UTC on the 1st of the month
 * (via `Date.UTC`) so parsing is timezone-invariant: a given string always
 * yields the same instant whether it runs on the user's browser or on a server
 * in any timezone. This keeps parsing symmetric with {@link formatDate}, which
 * also renders in UTC, preventing off-by-one-month drift.
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
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Try "Month Year" format (e.g., "Jan 2024", "January 2024")
  const monthYearMatch = str.match(/^([a-zA-Z]+)\s*[\s,.-]*\s*(\d{4})$/);
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const year = parseInt(monthYearMatch[2], 10);
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && year >= 1950 && year <= 2100) {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Try "Year Month" format (e.g., "2024 Jan")
  const yearMonthMatch = str.match(/^(\d{4})\s*[\s,.-]*\s*([a-zA-Z]+)$/);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const monthKey = yearMonthMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (month !== undefined && year >= 1950 && year <= 2100) {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Try MM/YYYY or MM-YYYY format
  const mmYYYYMatch = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mmYYYYMatch) {
    const month = parseInt(mmYYYYMatch[1], 10) - 1;
    const year = parseInt(mmYYYYMatch[2], 10);
    if (year >= 1950 && year <= 2100 && month >= 0 && month <= 11) {
      return new Date(Date.UTC(year, month, 1));
    }
  }

  // Just a year (e.g., "2024")
  const yearOnlyMatch = str.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    if (year >= 1950 && year <= 2100) {
      return new Date(Date.UTC(year, 0, 1));
    }
  }

  // Fall back to standard Date parsing
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
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
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  return '';
}

/**
 * Parse an HTML `<input type="month">` value ("YYYY-MM") into a
 * timezone-stable `Date` anchored at midnight UTC on the 1st of that month.
 *
 * Using `Date.UTC` (instead of `new Date(year, month, 1)` or
 * `new Date("YYYY-MM")` implicitly) makes the stored instant identical on every
 * runtime timezone, so the month a user selects is exactly the month that gets
 * persisted and later rendered. Returns `null` for empty or malformed input so
 * callers can store an explicit null rather than an "Invalid Date".
 */
export function parseMonthInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Convert a stored `Date` (or ISO string) into the "YYYY-MM" value expected by
 * an HTML `<input type="month">`.
 *
 * Reads the UTC calendar fields so the control displays the same month that was
 * persisted, regardless of the browser's timezone. Returns an empty string for
 * nullish or invalid dates.
 */
export function toMonthInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}
export function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    // Guard: only works in browser environments
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Timeout to prevent hanging; also clean up the Image ref
    const timeoutId = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = ''; // Cancel pending load
      resolve(null);
    }, 5000);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(null);
    };

    img.src = url;
  });
}

/**
 * Compare multiple image URLs and return the one with highest resolution
 * Returns the URL with the highest pixel count (width * height)
 */
export async function getBestResolutionImage(
  imageUrls: (string | undefined | null)[]
): Promise<string | null> {
  const validUrls = imageUrls.filter((url): url is string => !!url);

  if (validUrls.length === 0) return null;
  if (validUrls.length === 1) return validUrls[0];

  const dimensionsPromises = validUrls.map(async (url) => {
    const dims = await getImageDimensions(url);
    return { url, dims };
  });

  const results = await Promise.all(dimensionsPromises);

  let bestUrl = validUrls[0]; // Default to first valid URL
  let bestPixels = 0;

  for (const { url, dims } of results) {
    if (dims) {
      const pixels = dims.width * dims.height;
      if (pixels > bestPixels) {
        bestPixels = pixels;
        bestUrl = url;
      }
    }
  }

  return bestUrl;
}

/**
 * Convert a file to base64 data URL
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// PHONE NUMBER PARSING UTILITIES
// ============================================================================

/**
 * Common country codes for phone number detection
 * Sorted by dial code length (longest first) to match properly
 */
const COMMON_COUNTRY_CODES: { dialCode: string; countries: string[] }[] = [
  { dialCode: '+1', countries: ['US', 'CA'] }, // North America
  { dialCode: '+7', countries: ['RU', 'KZ'] }, // Russia, Kazakhstan
  { dialCode: '+20', countries: ['EG'] }, // Egypt
  { dialCode: '+27', countries: ['ZA'] }, // South Africa
  { dialCode: '+30', countries: ['GR'] }, // Greece
  { dialCode: '+31', countries: ['NL'] }, // Netherlands
  { dialCode: '+32', countries: ['BE'] }, // Belgium
  { dialCode: '+33', countries: ['FR'] }, // France
  { dialCode: '+34', countries: ['ES'] }, // Spain
  { dialCode: '+36', countries: ['HU'] }, // Hungary
  { dialCode: '+39', countries: ['IT'] }, // Italy
  { dialCode: '+40', countries: ['RO'] }, // Romania
  { dialCode: '+41', countries: ['CH'] }, // Switzerland
  { dialCode: '+43', countries: ['AT'] }, // Austria
  { dialCode: '+44', countries: ['GB'] }, // UK
  { dialCode: '+45', countries: ['DK'] }, // Denmark
  { dialCode: '+46', countries: ['SE'] }, // Sweden
  { dialCode: '+47', countries: ['NO'] }, // Norway
  { dialCode: '+48', countries: ['PL'] }, // Poland
  { dialCode: '+49', countries: ['DE'] }, // Germany
  { dialCode: '+51', countries: ['PE'] }, // Peru
  { dialCode: '+52', countries: ['MX'] }, // Mexico
  { dialCode: '+53', countries: ['CU'] }, // Cuba
  { dialCode: '+54', countries: ['AR'] }, // Argentina
  { dialCode: '+55', countries: ['BR'] }, // Brazil
  { dialCode: '+56', countries: ['CL'] }, // Chile
  { dialCode: '+57', countries: ['CO'] }, // Colombia
  { dialCode: '+58', countries: ['VE'] }, // Venezuela
  { dialCode: '+60', countries: ['MY'] }, // Malaysia
  { dialCode: '+61', countries: ['AU'] }, // Australia
  { dialCode: '+62', countries: ['ID'] }, // Indonesia
  { dialCode: '+63', countries: ['PH'] }, // Philippines
  { dialCode: '+64', countries: ['NZ'] }, // New Zealand
  { dialCode: '+65', countries: ['SG'] }, // Singapore
  { dialCode: '+66', countries: ['TH'] }, // Thailand
  { dialCode: '+81', countries: ['JP'] }, // Japan
  { dialCode: '+82', countries: ['KR'] }, // South Korea
  { dialCode: '+84', countries: ['VN'] }, // Vietnam
  { dialCode: '+86', countries: ['CN'] }, // China
  { dialCode: '+90', countries: ['TR'] }, // Turkey
  { dialCode: '+91', countries: ['IN'] }, // India
  { dialCode: '+92', countries: ['PK'] }, // Pakistan
  { dialCode: '+93', countries: ['AF'] }, // Afghanistan
  { dialCode: '+94', countries: ['LK'] }, // Sri Lanka
  { dialCode: '+95', countries: ['MM'] }, // Myanmar
  { dialCode: '+98', countries: ['IR'] }, // Iran
  { dialCode: '+212', countries: ['MA'] }, // Morocco
  { dialCode: '+213', countries: ['DZ'] }, // Algeria
  { dialCode: '+216', countries: ['TN'] }, // Tunisia
  { dialCode: '+234', countries: ['NG'] }, // Nigeria
  { dialCode: '+254', countries: ['KE'] }, // Kenya
  { dialCode: '+351', countries: ['PT'] }, // Portugal
  { dialCode: '+353', countries: ['IE'] }, // Ireland
  { dialCode: '+354', countries: ['IS'] }, // Iceland
  { dialCode: '+358', countries: ['FI'] }, // Finland
  { dialCode: '+420', countries: ['CZ'] }, // Czech Republic
  { dialCode: '+421', countries: ['SK'] }, // Slovakia
  { dialCode: '+852', countries: ['HK'] }, // Hong Kong
  { dialCode: '+853', countries: ['MO'] }, // Macau
  { dialCode: '+880', countries: ['BD'] }, // Bangladesh
  { dialCode: '+886', countries: ['TW'] }, // Taiwan
  { dialCode: '+966', countries: ['SA'] }, // Saudi Arabia
  { dialCode: '+971', countries: ['AE'] }, // UAE
  { dialCode: '+972', countries: ['IL'] }, // Israel
].sort((a, b) => b.dialCode.length - a.dialCode.length); // Sort by length desc

export interface ParsedPhone {
  countryCode: string | null;
  number: string;
  raw: string;
}

/**
 * Parse a phone string to extract country code and number
 * Works for both imported data (may or may not have +) and user input
 *
 * @param phone - Raw phone string (e.g., "+919876543210", "9876543210", "+1 555 123 4567")
 * @returns ParsedPhone with separated countryCode and number
 */
export function parsePhoneWithCountryCode(phone: string | null | undefined): ParsedPhone {
  if (!phone) return { countryCode: null, number: '', raw: '' };

  const raw = phone.trim();

  // Normalize: remove spaces, dashes, parentheses but keep + and digits
  const normalized = raw.replace(/[\s\-().]/g, '');

  // Check if starts with + (explicit country code)
  if (normalized.startsWith('+')) {
    // Try to match known country codes
    for (const cc of COMMON_COUNTRY_CODES) {
      if (normalized.startsWith(cc.dialCode)) {
        const number = normalized.slice(cc.dialCode.length);
        return { countryCode: cc.dialCode, number, raw };
      }
    }

    // Unknown country code - try to extract it (up to 4 digits after +)
    const match = normalized.match(/^(\+\d{1,4})(\d+)$/);
    if (match) {
      return { countryCode: match[1], number: match[2], raw };
    }
  }

  // No + prefix - don't assume country code
  // Only detect if there's explicit evidence (like 11 digits starting with 1 for US)
  const digits = normalized.replace(/\D/g, '');

  // 11 digits starting with 1 = likely US/Canada with country code prefix
  if (digits.length === 11 && digits.startsWith('1')) {
    return { countryCode: '+1', number: digits.slice(1), raw };
  }

  // For all other cases, don't assume - let user specify country code
  // This avoids incorrect assumptions (e.g., 10-digit US vs Indian numbers)

  // 12+ digits starting with country code - try to detect
  if (digits.length >= 12) {
    for (const cc of COMMON_COUNTRY_CODES) {
      const codeDigits = cc.dialCode.slice(1); // Remove +
      if (digits.startsWith(codeDigits)) {
        const number = digits.slice(codeDigits.length);
        // Validate reasonable length (most numbers are 8-12 digits)
        if (number.length >= 8 && number.length <= 12) {
          return { countryCode: cc.dialCode, number, raw };
        }
      }
    }
  }

  // Can't determine country code - return as-is
  return { countryCode: null, number: digits || normalized, raw };
}

/**
 * Format a parsed phone for display
 */
export function formatParsedPhone(parsed: ParsedPhone): string {
  if (!parsed.number) return '';

  // Format the number in standard format based on country code
  const formatted = formatStandardPhoneNumber(parsed.number, parsed.countryCode);

  if (parsed.countryCode) {
    return `${parsed.countryCode} ${formatted}`;
  }
  return formatted;
}

/**
 * Format a phone number string into standard readable format.
 * - US/Canada (+1, 10 digits): (XXX) XXX-XXXX
 * - India (+91, 10 digits): XXXXX XXXXX
 * - UK (+44, 10-11 digits): XXXX XXX XXXX
 * - Others: groups of 3-4 digits
 */
function formatStandardPhoneNumber(number: string, dialCode: string | null): string {
  const digits = number.replace(/\D/g, '');
  if (!digits) return number;

  if (dialCode === '+1' && digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (dialCode === '+91' && digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (dialCode === '+44' && (digits.length === 10 || digits.length === 11)) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  // Generic: group into chunks of 3, last chunk can be 3-4
  if (digits.length >= 7) {
    const parts: string[] = [];
    let i = 0;
    while (i < digits.length) {
      const remaining = digits.length - i;
      if (remaining <= 4) {
        parts.push(digits.slice(i));
        break;
      }
      parts.push(digits.slice(i, i + 3));
      i += 3;
    }
    return parts.join(' ');
  }

  return digits;
}
