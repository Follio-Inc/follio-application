/**
 * Resume Parser Helpers Unit Tests
 *
 * Tests for helper functions in lib/resume-parser/helpers.ts
 */

import {
  BULLET_POINTS,
  divideSectionIntoSubsections,
  getBulletPointsFromLines,
  getDescriptionsLineIdx,
  getTextFromLines,
} from '@/lib/resume-parser/helpers';
import type { Lines, TextItem } from '@/lib/resume-parser/types';
import { describe, expect, it } from 'vitest';

// Helper to create mock text items
const createTextItem = (text: string, y = 100, fontName = 'Arial', height = 12): TextItem => ({
  text,
  x: 0,
  y,
  width: text.length * 8,
  height,
  fontName,
  hasEOL: false,
});

// Helper to create lines
const createLine = (texts: string[], y = 100): TextItem[] =>
  texts.map((text) => createTextItem(text, y));

describe('Resume Parser Helpers', () => {
  describe('BULLET_POINTS', () => {
    it('should include common bullet characters', () => {
      expect(BULLET_POINTS).toContain('•');
      expect(BULLET_POINTS).toContain('-');
      expect(BULLET_POINTS).toContain('*');
      expect(BULLET_POINTS).toContain('→');
      expect(BULLET_POINTS).toContain('●');
    });

    it('should be an array of strings', () => {
      expect(Array.isArray(BULLET_POINTS)).toBe(true);
      BULLET_POINTS.forEach((bp) => {
        expect(typeof bp).toBe('string');
      });
    });
  });

  describe('divideSectionIntoSubsections', () => {
    it('should return empty array for empty lines', () => {
      const result = divideSectionIntoSubsections([]);
      expect(result).toEqual([]);
    });

    it('should return single subsection for single line', () => {
      const lines: Lines = [createLine(['Hello World'])];
      const result = divideSectionIntoSubsections(lines);
      expect(result.length).toBe(1);
    });

    it('should keep continuous lines in same subsection', () => {
      const lines: Lines = [
        createLine(['Line 1'], 100),
        createLine(['Line 2'], 88), // 12px gap (normal)
        createLine(['Line 3'], 76),
      ];
      const result = divideSectionIntoSubsections(lines);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(3);
    });

    it('should split into subsections on large gaps', () => {
      const lines: Lines = [
        createLine(['Work Experience 1'], 100),
        createLine(['Description 1'], 88),
        createLine(['Work Experience 2'], 50), // Large gap
        createLine(['Description 2'], 38),
      ];
      const result = divideSectionIntoSubsections(lines);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getDescriptionsLineIdx', () => {
    it('should return undefined for empty lines', () => {
      const result = getDescriptionsLineIdx([]);
      expect(result).toBeUndefined();
    });

    it('should return index of first bullet point line', () => {
      const lines: Lines = [
        createLine(['Company Name']),
        createLine(['• First bullet point']),
        createLine(['• Second bullet point']),
      ];
      const result = getDescriptionsLineIdx(lines);
      expect(result).toBe(1);
    });

    it('should return undefined if no bullet points', () => {
      const lines: Lines = [
        createLine(['Company Name']),
        createLine(['Role Title']),
        createLine(['Some description without bullet']),
      ];
      const result = getDescriptionsLineIdx(lines);
      expect(result).toBeUndefined();
    });

    it('should detect dash as bullet point', () => {
      const lines: Lines = [createLine(['Title']), createLine(['- First item'])];
      const result = getDescriptionsLineIdx(lines);
      expect(result).toBe(1);
    });
  });

  describe('getBulletPointsFromLines', () => {
    it('should extract text from lines without bullet points', () => {
      const lines: Lines = [createLine(['Hello']), createLine(['World'])];
      const result = getBulletPointsFromLines(lines);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('should extract bullet points', () => {
      const lines: Lines = [
        createLine(['• First point']),
        createLine(['• Second point']),
        createLine(['• Third point']),
      ];
      const result = getBulletPointsFromLines(lines);
      expect(result.length).toBe(3);
    });

    it('should handle mixed content', () => {
      const lines: Lines = [
        createLine(['Header']),
        createLine(['• Point one']),
        createLine(['• Point two']),
      ];
      const result = getBulletPointsFromLines(lines);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should clean whitespace in descriptions', () => {
      const lines: Lines = [createLine(['•   Lots    of   spaces   '])];
      const result = getBulletPointsFromLines(lines);
      expect(result[0]).not.toMatch(/\s{2,}/);
    });
  });

  describe('getTextFromLines', () => {
    it('should return empty string for empty lines', () => {
      const result = getTextFromLines([]);
      expect(result).toBe('');
    });

    it('should concatenate all text items', () => {
      const lines: Lines = [
        createLine(['Hello', ' ', 'World']),
        createLine(['How', ' ', 'are you']),
      ];
      const result = getTextFromLines(lines);
      expect(result).toContain('Hello');
      expect(result).toContain('World');
      expect(result).toContain('How');
    });

    it('should join lines with spaces', () => {
      const lines: Lines = [createLine(['Line 1']), createLine(['Line 2'])];
      const result = getTextFromLines(lines);
      expect(result).toBe('Line 1 Line 2');
    });

    it('should handle single line', () => {
      const lines: Lines = [createLine(['Single Line'])];
      const result = getTextFromLines(lines);
      expect(result).toBe('Single Line');
    });
  });
});
