/**
 * Phone utilities — framework-agnostic, server-safe.
 *
 * These helpers contain no React or browser dependencies and therefore
 * must live outside any `'use client'` module. They are consumed both by
 * the client-side `PhoneInput` component and by server-side code such as
 * the PDF export service. Keeping them here prevents the Next.js
 * client/server boundary violation that occurs when a function exported
 * from a `'use client'` module is invoked on the server (which throws in
 * production builds).
 */

import { Country } from 'country-state-city';

export interface PhoneValue {
  /** e.g., "+1::US" (with isoCode) or "+91" (legacy) or null. */
  countryCode: string | null;
  /** The phone number without country code. */
  number: string;
}

export interface CountryOption {
  name: string;
  isoCode: string;
  flag: string;
  dialCode: string;
  /** Unique key combining dialCode and isoCode (e.g., "+1::US"). */
  selectKey: string;
}

/**
 * All countries formatted for phone-code selection.
 *
 * A unique `selectKey` (dialCode::isoCode) distinguishes countries that
 * share a dial code (e.g., USA and Canada both use +1).
 */
export const countries: CountryOption[] = Country.getAllCountries().map((country) => {
  const dialCode = country.phonecode.startsWith('+') ? country.phonecode : `+${country.phonecode}`;
  return {
    name: country.name,
    isoCode: country.isoCode,
    flag: country.flag,
    dialCode,
    selectKey: `${dialCode}::${country.isoCode}`,
  };
});

/**
 * Parse a phone string into a {@link PhoneValue}.
 *
 * If the phone has a country code (starts with `+`), it is extracted;
 * otherwise `countryCode` is `null`.
 */
export function parsePhoneString(phone: string): PhoneValue {
  if (!phone) return { countryCode: null, number: '' };

  const trimmed = phone.trim();

  // Check if it starts with + (has country code)
  if (trimmed.startsWith('+')) {
    // Try to match known country codes
    for (const country of countries) {
      if (trimmed.startsWith(country.dialCode)) {
        const number = trimmed.slice(country.dialCode.length).trim();
        return { countryCode: country.dialCode, number };
      }
    }
    // Unknown country code - extract first part as code
    const match = trimmed.match(/^(\+\d{1,4})\s*(.*)$/);
    if (match) {
      return { countryCode: match[1], number: match[2] };
    }
  }

  // No country code - return as number only
  return { countryCode: null, number: trimmed };
}

/**
 * Extract the numeric dial code from a countryCode value.
 * Handles both selectKey format "+1::US" and legacy "+1" format.
 */
export function extractDialCode(countryCode: string | null): string | null {
  if (!countryCode) return null;
  if (countryCode.includes('::')) {
    return countryCode.split('::')[0];
  }
  return countryCode;
}

/**
 * Format a phone number string into standard readable format.
 * - US/Canada (+1, 10 digits): (XXX) XXX-XXXX
 * - India (+91, 10 digits): XXXXX XXXXX
 * - UK (+44, 10-11 digits): XXXX XXX XXXX
 * - Others: groups of 3-4 digits
 */
export function formatStandardPhone(number: string, dialCode: string | null): string {
  // Strip all non-digit characters
  const digits = number.replace(/\D/g, '');
  if (!digits) return number;

  // US/Canada: (XXX) XXX-XXXX
  if (dialCode === '+1' && digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // India: XXXXX XXXXX
  if (dialCode === '+91' && digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }

  // UK: XXXX XXX XXXX (for 10-11 digit numbers)
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

/**
 * Format a {@link PhoneValue} back to a display string.
 * Uses only numeric country code (no "US"/"IN" suffix) and standard phone formatting.
 */
export function formatPhoneValue(value: PhoneValue): string {
  if (!value.number) return '';
  const dialCode = extractDialCode(value.countryCode);
  const formattedNumber = formatStandardPhone(value.number, dialCode);
  if (dialCode) {
    return `${dialCode} ${formattedNumber}`.trim();
  }
  return formattedNumber;
}

/**
 * Clean a stored phone string for display.
 * Handles legacy format like "+1::US 6287241570" → "+1 (628) 724-1570".
 */
export function cleanPhoneDisplay(phone: string): string {
  if (!phone) return '';
  // Match "+1::US 6287241570" pattern
  const match = phone.match(/^(\+\d{1,4})::([A-Z]{2})\s*(.*)$/);
  if (match) {
    const dialCode = match[1];
    const rawNumber = match[3];
    const formatted = formatStandardPhone(rawNumber, dialCode);
    return `${dialCode} ${formatted}`;
  }
  // Already clean - try to format if it has a country code
  const parsed = parsePhoneString(phone);
  if (parsed.countryCode) {
    const dialCode = extractDialCode(parsed.countryCode);
    const formatted = formatStandardPhone(parsed.number, dialCode);
    return dialCode ? `${dialCode} ${formatted}` : formatted;
  }
  return phone;
}
