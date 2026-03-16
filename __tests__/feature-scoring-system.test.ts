/**
 * Feature Scoring System Unit Tests
 *
 * Tests for lib/resume-parser/feature-scoring-system.ts — the core scoring
 * algorithm and all predicate/matcher functions used by the extractors.
 */

import {
  DATE_FEATURE_SETS,
  getHasText,
  getTextWithHighestFeatureScore,
  hasAt,
  hasComma,
  hasLetter,
  hasLetterAndIsAllUpperCase,
  hasNumber,
  hasParenthesis,
  hasSlash,
  isBold,
  matchMonth,
  matchPresent,
  matchSeason,
  matchYear,
} from '@/lib/resume-parser/feature-scoring-system';
import type { FeatureSet, TextItem } from '@/lib/resume-parser/types';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────

const makeItem = (text: string, fontName = 'Arial'): TextItem => ({
  text,
  x: 0,
  y: 0,
  width: text.length * 8,
  height: 12,
  fontName,
  hasEOL: false,
});

// ── Boolean Feature Functions ────────────────────────────────

describe('Feature Functions', () => {
  describe('isBold', () => {
    it('returns true for font names containing "bold"', () => {
      expect(isBold(makeItem('Hello', 'Arial-Bold'))).toBe(true);
      expect(isBold(makeItem('Hello', 'TimesNewRoman-BoldItalic'))).toBe(true);
    });

    it('returns true for "heavy" or "black" fonts', () => {
      expect(isBold(makeItem('Hi', 'Helvetica-Heavy'))).toBe(true);
      expect(isBold(makeItem('Hi', 'Roboto-Black'))).toBe(true);
    });

    it('returns false for regular fonts', () => {
      expect(isBold(makeItem('Hi', 'Arial'))).toBe(false);
      expect(isBold(makeItem('Hi', 'TimesNewRoman-Italic'))).toBe(false);
    });
  });

  describe('hasNumber', () => {
    it('detects digits', () => {
      expect(hasNumber(makeItem('abc123'))).toBe(true);
      expect(hasNumber(makeItem('2024'))).toBe(true);
    });

    it('returns false when no digits present', () => {
      expect(hasNumber(makeItem('no digits here'))).toBe(false);
    });
  });

  describe('hasComma', () => {
    it('detects commas', () => {
      expect(hasComma(makeItem('San Jose, CA'))).toBe(true);
    });
    it('returns false without commas', () => {
      expect(hasComma(makeItem('no comma'))).toBe(false);
    });
  });

  describe('hasLetter', () => {
    it('detects letters', () => {
      expect(hasLetter(makeItem('abc'))).toBe(true);
      expect(hasLetter(makeItem('123a'))).toBe(true);
    });
    it('returns false for only digits/symbols', () => {
      expect(hasLetter(makeItem('12345'))).toBe(false);
      expect(hasLetter(makeItem('!@#'))).toBe(false);
    });
  });

  describe('hasLetterAndIsAllUpperCase', () => {
    it('returns true for all uppercase text with letters', () => {
      expect(hasLetterAndIsAllUpperCase(makeItem('EXPERIENCE'))).toBe(true);
      expect(hasLetterAndIsAllUpperCase(makeItem('SKILLS & TOOLS'))).toBe(true);
    });
    it('returns false for mixed case', () => {
      expect(hasLetterAndIsAllUpperCase(makeItem('Experience'))).toBe(false);
    });
    it('returns false when no letters', () => {
      expect(hasLetterAndIsAllUpperCase(makeItem('123'))).toBe(false);
    });
  });

  describe('hasAt', () => {
    it('detects @ symbol', () => {
      expect(hasAt(makeItem('john@example.com'))).toBe(true);
    });
    it('returns false without @', () => {
      expect(hasAt(makeItem('john.doe'))).toBe(false);
    });
  });

  describe('hasParenthesis', () => {
    it('detects opening parenthesis', () => {
      expect(hasParenthesis(makeItem('(555)'))).toBe(true);
    });
    it('detects closing parenthesis', () => {
      expect(hasParenthesis(makeItem('text) more'))).toBe(true);
    });
    it('returns false without parentheses', () => {
      expect(hasParenthesis(makeItem('no parens'))).toBe(false);
    });
  });

  describe('hasSlash', () => {
    it('detects slash', () => {
      expect(hasSlash(makeItem('github.com/user'))).toBe(true);
    });
    it('returns false without slash', () => {
      expect(hasSlash(makeItem('no slash'))).toBe(false);
    });
  });

  describe('getHasText', () => {
    it('creates a function that checks for specific text', () => {
      const hasFoo = getHasText('foo');
      expect(hasFoo(makeItem('contains foo inside'))).toBe(true);
      expect(hasFoo(makeItem('no match'))).toBe(false);
    });
  });
});

// ── Date Matchers ────────────────────────────────────────────

describe('Date Matchers', () => {
  describe('matchYear', () => {
    it('matches 4-digit years starting with 19 or 20', () => {
      expect(matchYear(makeItem('2024'))).toBeTruthy();
      expect(matchYear(makeItem('Started in 1998'))).toBeTruthy();
    });

    it('does not match years starting with other centuries', () => {
      expect(matchYear(makeItem('2100'))).toBeNull();
      expect(matchYear(makeItem('1800'))).toBeNull();
    });
  });

  describe('matchMonth', () => {
    it('matches full month names', () => {
      expect(matchMonth(makeItem('January 2024'))).toBeTruthy();
      expect(matchMonth(makeItem('december'))).toBeTruthy();
    });

    it('matches abbreviated months', () => {
      expect(matchMonth(makeItem('Jan 2024'))).toBeTruthy();
      expect(matchMonth(makeItem('Sep'))).toBeTruthy();
    });

    it('does not match non-month words', () => {
      expect(matchMonth(makeItem('Hello World'))).toBeNull();
    });
  });

  describe('matchSeason', () => {
    it('matches season keywords', () => {
      expect(matchSeason(makeItem('Spring 2023'))).toBeTruthy();
      expect(matchSeason(makeItem('summer internship'))).toBeTruthy();
      expect(matchSeason(makeItem('Fall 2022'))).toBeTruthy();
      expect(matchSeason(makeItem('Winter term'))).toBeTruthy();
      expect(matchSeason(makeItem('autumn'))).toBeTruthy();
    });

    it('does not match non-season words', () => {
      expect(matchSeason(makeItem('January'))).toBeNull();
    });
  });

  describe('matchPresent', () => {
    it('matches "Present"', () => {
      expect(matchPresent(makeItem('Jan 2020 - Present'))).toBeTruthy();
    });
    it('matches "Current"', () => {
      expect(matchPresent(makeItem('Current'))).toBeTruthy();
    });
    it('matches "Now"', () => {
      expect(matchPresent(makeItem('now'))).toBeTruthy();
    });
    it('does not match past-tense words', () => {
      expect(matchPresent(makeItem('previously'))).toBeNull();
    });
  });

  describe('DATE_FEATURE_SETS', () => {
    it('is an array of feature sets', () => {
      expect(DATE_FEATURE_SETS).toBeInstanceOf(Array);
      expect(DATE_FEATURE_SETS.length).toBeGreaterThan(0);
    });
  });
});

// ── getTextWithHighestFeatureScore ───────────────────────────

describe('getTextWithHighestFeatureScore', () => {
  const boldFeature: FeatureSet = [isBold, 3];
  const hasNumberFeature: FeatureSet = [hasNumber, -2];

  it('returns the text with the highest score', () => {
    const items = [makeItem('John Doe', 'Arial-Bold'), makeItem('555-1234', 'Arial')];
    const [text] = getTextWithHighestFeatureScore(items, [boldFeature, hasNumberFeature]);
    expect(text).toBe('John Doe');
  });

  it('returns empty string when returnEmptyIfNoMatch is true and nothing matches', () => {
    // All features give negative scores or don't match
    const items = [makeItem('12345', 'Arial')]; // hasNumber → negative, not bold
    const [text] = getTextWithHighestFeatureScore(items, [boldFeature], true);
    expect(text).toBe('');
  });

  it('returns the item even without a match when returnEmptyIfNoMatch is false', () => {
    const items = [makeItem('Hello', 'Arial')];
    const [text] = getTextWithHighestFeatureScore(items, [boldFeature], false);
    expect(text).toBe('Hello');
  });

  it('concatenates tied texts when returnConcatenatedForTies is true', () => {
    // Two items with equal score — both bold, no numbers
    const items = [
      makeItem('Experienced developer', 'Helvetica-Bold'),
      makeItem('with strong skills', 'Arial-Bold'),
    ];
    const [text] = getTextWithHighestFeatureScore(items, [boldFeature], true, true);
    expect(text).toBe('Experienced developer with strong skills');
  });

  it('returns all text scores as second element', () => {
    const items = [makeItem('A', 'Arial'), makeItem('B', 'Arial-Bold')];
    const [, scores] = getTextWithHighestFeatureScore(items, [boldFeature]);
    expect(scores).toHaveLength(2);
    expect(scores[0]).toHaveProperty('text');
    expect(scores[0]).toHaveProperty('score');
    expect(scores[0]).toHaveProperty('match');
  });

  it('uses regex match text when returnMatchOnly is true', () => {
    const yearFeature: FeatureSet = [matchYear, 2, true];
    const items = [makeItem('Worked from 2020 to 2023')];
    const [text] = getTextWithHighestFeatureScore(items, [yearFeature]);
    // Should return the matched year, not the full text
    expect(text).toBe('2020');
  });

  it('handles empty text items array', () => {
    const [text, scores] = getTextWithHighestFeatureScore([], [boldFeature]);
    expect(text).toBe('');
    expect(scores).toHaveLength(0);
  });
});
