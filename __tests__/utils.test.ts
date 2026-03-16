/**
 * Utils Unit Tests
 *
 * Tests for utility functions in lib/utils.ts
 */

import {
  absoluteUrl,
  calculateDuration,
  capitalize,
  cn,
  delay,
  formatDate,
  formatDateRange,
  formatNumber,
  formatParsedPhone,
  generateHandle,
  generateToken,
  getBaseUrl,
  isServer,
  isValidHandle,
  parseDateFlexible,
  parsePhoneWithCountryCode,
  toMonthInputFormat,
  truncate,
} from '@/lib/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Utils', () => {
  describe('cn (className merge)', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'inactive')).toBe('base active');
    });

    it('should merge Tailwind classes correctly', () => {
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('should handle undefined and null values', () => {
      expect(cn('base', undefined, null, 'extra')).toBe('base extra');
    });

    it('should handle empty inputs', () => {
      expect(cn()).toBe('');
    });

    it('should handle arrays', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar');
    });
  });

  describe('formatDate', () => {
    it('should format a Date object', () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      expect(formatDate(date)).toBe('Jan 2024');
    });

    it('should format a date string', () => {
      expect(formatDate('2024-01-15')).toMatch(/Jan 2024/);
    });

    it('should return empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(formatDate(undefined)).toBe('');
    });

    it('should use custom format options', () => {
      const date = new Date(2024, 0, 15);
      const result = formatDate(date, { month: 'long', year: 'numeric' });
      expect(result).toBe('January 2024');
    });
  });

  describe('formatDateRange', () => {
    it('should format a date range', () => {
      const start = new Date(2020, 0, 1);
      const end = new Date(2024, 0, 1);
      expect(formatDateRange(start, end)).toBe('Jan 2020 - Jan 2024');
    });

    it('should show Present for current positions', () => {
      const start = new Date(2020, 0, 1);
      expect(formatDateRange(start, null, true)).toBe('Jan 2020 - Present');
    });

    it('should return empty string if no start date', () => {
      expect(formatDateRange(null, new Date())).toBe('');
    });

    it('should handle string dates', () => {
      const result = formatDateRange('2020-01-01', '2024-01-01');
      // Just verify it returns a date range format (may vary by timezone)
      expect(result).toMatch(/\w+ \d{4} - \w+ \d{4}/);
    });
  });

  describe('calculateDuration', () => {
    it('should calculate duration in years and months', () => {
      const start = new Date(2020, 0, 1);
      const end = new Date(2022, 6, 1); // 2.5 years
      const result = calculateDuration(start, end);
      expect(result).toMatch(/yr|mo/);
    });

    it('should return months only for short durations', () => {
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 5, 1); // 6 months
      const result = calculateDuration(start, end);
      expect(result).toMatch(/mo/);
    });

    it('should return empty string if no start date', () => {
      expect(calculateDuration(null, new Date())).toBe('');
    });

    it('should calculate from start to now for current positions', () => {
      const start = new Date(2020, 0, 1);
      const result = calculateDuration(start, null, true);
      expect(result).toMatch(/yr|mo/);
    });

    it('should handle string dates', () => {
      const result = calculateDuration('2020-01-01', '2021-01-01');
      expect(result).toMatch(/yr|mo/);
    });

    it('should return years only when no remaining months', () => {
      const start = new Date(2020, 0, 1);
      const end = new Date(2022, 0, 1); // Exactly 2 years
      const result = calculateDuration(start, end);
      expect(result).toMatch(/yr/);
    });
  });

  describe('generateHandle', () => {
    it('should generate handle from first and last name', () => {
      expect(generateHandle('John', 'Doe')).toBe('john-doe');
    });

    it('should generate handle from first name only', () => {
      expect(generateHandle('John')).toBe('john');
    });

    it('should remove special characters', () => {
      expect(generateHandle("John's", "O'Brien")).toBe('john-s-o-brien');
    });

    it('should handle spaces', () => {
      expect(generateHandle('John   Paul', 'Doe')).toBe('john-paul-doe');
    });

    it('should truncate long names to 30 characters', () => {
      const result = generateHandle(
        'VerylongfirstnameThatisTooLong',
        'VeryLongLastnameThatIsAlsoTooLong'
      );
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should remove leading and trailing hyphens', () => {
      expect(generateHandle('-John-', '-Doe-')).toBe('john-doe');
    });
  });

  describe('isValidHandle', () => {
    it('should return true for valid handles', () => {
      expect(isValidHandle('john-doe')).toBe(true);
      expect(isValidHandle('john123')).toBe(true);
      expect(isValidHandle('a1b')).toBe(true);
    });

    it('should return false for invalid handles', () => {
      expect(isValidHandle('a')).toBe(false); // too short
      expect(isValidHandle('-john')).toBe(false); // starts with hyphen
      expect(isValidHandle('john-')).toBe(false); // ends with hyphen
      expect(isValidHandle('John')).toBe(false); // uppercase
      expect(isValidHandle('john doe')).toBe(false); // space
    });

    it('should return false for handles with special characters', () => {
      expect(isValidHandle('john@doe')).toBe(false);
      expect(isValidHandle('john.doe')).toBe(false);
    });
  });

  describe('truncate', () => {
    it('should truncate long text', () => {
      expect(truncate('Hello World, this is a long text', 15)).toBe('Hello World,...');
    });

    it('should not truncate short text', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should handle exact length', () => {
      expect(truncate('Hello', 5)).toBe('Hello');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should lowercase the rest', () => {
      expect(capitalize('HELLO')).toBe('Hello');
    });

    it('should handle single character', () => {
      expect(capitalize('h')).toBe('H');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with K suffix', () => {
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(1000)).toBe('1.0K');
    });

    it('should format numbers with M suffix', () => {
      expect(formatNumber(1500000)).toBe('1.5M');
      expect(formatNumber(1000000)).toBe('1.0M');
    });

    it('should not format small numbers', () => {
      expect(formatNumber(999)).toBe('999');
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('generateToken', () => {
    it('should generate token of default length', () => {
      const token = generateToken();
      expect(token.length).toBe(32);
    });

    it('should generate token of custom length', () => {
      const token = generateToken(16);
      expect(token.length).toBe(16);
    });

    it('should only contain alphanumeric characters', () => {
      const token = generateToken(100);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('isServer', () => {
    it('should be true in Node environment', () => {
      expect(isServer).toBe(true);
    });
  });

  describe('getBaseUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return NEXT_PUBLIC_APP_URL if set', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
      expect(getBaseUrl()).toBe('https://example.com');
    });

    it('should return VERCEL_URL if NEXT_PUBLIC_APP_URL not set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      process.env.VERCEL_URL = 'my-app.vercel.app';
      expect(getBaseUrl()).toBe('https://my-app.vercel.app');
    });

    it('should return localhost if no env vars set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.VERCEL_URL;
      expect(getBaseUrl()).toBe('http://localhost:3000');
    });
  });

  describe('absoluteUrl', () => {
    it('should create absolute URL with leading slash', () => {
      const result = absoluteUrl('/api/test');
      expect(result).toMatch(/\/api\/test$/);
    });

    it('should create absolute URL without leading slash', () => {
      const result = absoluteUrl('api/test');
      expect(result).toMatch(/\/api\/test$/);
    });
  });

  describe('parseDateFlexible', () => {
    it('should parse YYYY-MM format', () => {
      const date = parseDateFlexible('2024-01');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(0);
    });

    it('should parse Month Year format', () => {
      const date = parseDateFlexible('January 2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
      expect(date?.getMonth()).toBe(0);
    });

    it('should parse abbreviated month format', () => {
      const date = parseDateFlexible('Jan 2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse Year Month format', () => {
      const date = parseDateFlexible('2024 Jan');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse MM/YYYY format', () => {
      const date = parseDateFlexible('01/2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse MM-YYYY format', () => {
      const date = parseDateFlexible('01-2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse year only', () => {
      const date = parseDateFlexible('2024');
      expect(date).toBeInstanceOf(Date);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should return null for Present/Current', () => {
      expect(parseDateFlexible('Present')).toBeNull();
      expect(parseDateFlexible('Current')).toBeNull();
      expect(parseDateFlexible('Now')).toBeNull();
      expect(parseDateFlexible('Ongoing')).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parseDateFlexible('')).toBeNull();
      expect(parseDateFlexible(null)).toBeNull();
      expect(parseDateFlexible(undefined)).toBeNull();
    });

    it('should return null for invalid dates', () => {
      expect(parseDateFlexible('invalid')).toBeNull();
    });

    it('should return null for years out of range', () => {
      expect(parseDateFlexible('1800')).toBeNull();
      expect(parseDateFlexible('2200')).toBeNull();
    });

    it('should parse ISO format strings', () => {
      const date = parseDateFlexible('2024-01-15T00:00:00Z');
      expect(date).toBeInstanceOf(Date);
    });

    it('should handle all month abbreviations', () => {
      const months = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'sept',
        'oct',
        'nov',
        'dec',
      ];
      months.forEach((month) => {
        const date = parseDateFlexible(`${month} 2024`);
        expect(date).toBeInstanceOf(Date);
      });
    });

    it('should handle full month names', () => {
      const months = [
        'january',
        'february',
        'march',
        'april',
        'may',
        'june',
        'july',
        'august',
        'september',
        'october',
        'november',
        'december',
      ];
      months.forEach((month) => {
        const date = parseDateFlexible(`${month} 2024`);
        expect(date).toBeInstanceOf(Date);
      });
    });
  });

  describe('toMonthInputFormat', () => {
    it('should return YYYY-MM format unchanged', () => {
      expect(toMonthInputFormat('2024-01')).toBe('2024-01');
    });

    it('should convert Month Year to YYYY-MM', () => {
      expect(toMonthInputFormat('January 2024')).toBe('2024-01');
      expect(toMonthInputFormat('Jan 2024')).toBe('2024-01');
    });

    it('should return empty string for Present/Current', () => {
      expect(toMonthInputFormat('Present')).toBe('');
      expect(toMonthInputFormat('Current')).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(toMonthInputFormat(null)).toBe('');
      expect(toMonthInputFormat(undefined)).toBe('');
    });

    it('should convert year only to YYYY-01', () => {
      expect(toMonthInputFormat('2024')).toBe('2024-01');
    });

    it('should return empty string for invalid dates', () => {
      expect(toMonthInputFormat('invalid')).toBe('');
    });
  });

  describe('parsePhoneWithCountryCode', () => {
    it('should parse phone with explicit + country code', () => {
      const result = parsePhoneWithCountryCode('+919876543210');
      expect(result.countryCode).toBe('+91');
      expect(result.number).toBe('9876543210');
    });

    it('should parse US phone with +1 prefix', () => {
      const result = parsePhoneWithCountryCode('+15551234567');
      expect(result.countryCode).toBe('+1');
      expect(result.number).toBe('5551234567');
    });

    it('should parse UK phone with +44 prefix', () => {
      const result = parsePhoneWithCountryCode('+447911123456');
      expect(result.countryCode).toBe('+44');
      expect(result.number).toBe('7911123456');
    });

    it('should handle formatted phone with spaces and dashes', () => {
      const result = parsePhoneWithCountryCode('+1 (555) 123-4567');
      expect(result.countryCode).toBe('+1');
      expect(result.number).toBe('5551234567');
    });

    it('should NOT assume country code for 10 digit numbers (could be US, India, etc)', () => {
      // Don't auto-detect - too risky for incorrect assumptions
      const result = parsePhoneWithCountryCode('9876543210');
      expect(result.countryCode).toBeNull();
      expect(result.number).toBe('9876543210');
    });

    it('should NOT assume country code for any 10 digit number', () => {
      // US numbers, Indian numbers, etc - all should require explicit country code
      const result = parsePhoneWithCountryCode('5551234567');
      expect(result.countryCode).toBeNull();
      expect(result.number).toBe('5551234567');
    });

    it('should detect US number with 1 prefix (11 digits)', () => {
      const result = parsePhoneWithCountryCode('15551234567');
      expect(result.countryCode).toBe('+1');
      expect(result.number).toBe('5551234567');
    });

    it('should handle empty input', () => {
      expect(parsePhoneWithCountryCode('')).toEqual({ countryCode: null, number: '', raw: '' });
      expect(parsePhoneWithCountryCode(null)).toEqual({ countryCode: null, number: '', raw: '' });
      expect(parsePhoneWithCountryCode(undefined)).toEqual({
        countryCode: null,
        number: '',
        raw: '',
      });
    });

    it('should preserve raw value', () => {
      const result = parsePhoneWithCountryCode('+1 (555) 123-4567');
      expect(result.raw).toBe('+1 (555) 123-4567');
    });
  });

  describe('formatParsedPhone', () => {
    it('should format phone with country code', () => {
      expect(
        formatParsedPhone({ countryCode: '+91', number: '9876543210', raw: '+919876543210' })
      ).toBe('+91 98765 43210');
    });

    it('should format phone without country code', () => {
      expect(
        formatParsedPhone({ countryCode: null, number: '5551234567', raw: '5551234567' })
      ).toBe('555 123 4567');
    });

    it('should return empty string for empty number', () => {
      expect(formatParsedPhone({ countryCode: '+1', number: '', raw: '' })).toBe('');
    });
  });
});
