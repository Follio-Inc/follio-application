/**
 * Feature scoring system for extracting resume attributes
 * Based on OpenResume's feature-scoring-system.ts
 *
 * This is the core of the resume parser - it uses feature-based scoring
 * to identify the most likely text for each resume attribute
 */

import type { FeatureSet, TextItem, TextItems, TextScores } from './types';

/**
 * Get text with the highest feature score from a list of text items
 * Returns the text and all scores for debugging
 */
export function getTextWithHighestFeatureScore(
  textItems: TextItems | TextItem[],
  featureSets: FeatureSet[],
  returnEmptyIfNoMatch = true,
  returnConcatenatedForTies = false
): [string, TextScores] {
  const textScores: TextScores = [];

  for (const item of textItems) {
    let score = 0;
    let hasMatch = false;
    let matchedText = item.text;

    for (const featureSet of featureSets) {
      const [featureFunc, featureScore, returnMatchOnly] = featureSet;
      const result = featureFunc(item);

      if (result) {
        score += featureScore;
        hasMatch = true;

        // If the feature returns a regex match, use the matched text
        if (returnMatchOnly && Array.isArray(result)) {
          matchedText = result[0];
        }
      }
    }

    textScores.push({
      text: matchedText,
      score,
      match: hasMatch,
    });
  }

  // Sort by score (descending)
  const sortedScores = [...textScores].sort((a, b) => b.score - a.score);

  // Handle ties if requested
  if (returnConcatenatedForTies && sortedScores.length > 1) {
    const highestScore = sortedScores[0].score;
    const tiedTexts = sortedScores
      .filter((s) => s.score === highestScore && s.match)
      .map((s) => s.text);

    if (tiedTexts.length > 1) {
      return [tiedTexts.join(' '), textScores];
    }
  }

  // Return highest scoring text
  const winner = sortedScores[0];
  if (!winner || (returnEmptyIfNoMatch && !winner.match)) {
    return ['', textScores];
  }

  return [winner.text, textScores];
}

// ============================================
// Common feature functions used across extractors
// ============================================

/**
 * Check if text item is bold
 */
export function isBold(item: TextItem): boolean {
  const fontName = item.fontName.toLowerCase();
  return fontName.includes('bold') || fontName.includes('heavy') || fontName.includes('black');
}

/**
 * Check if text has a number
 */
export function hasNumber(item: TextItem): boolean {
  return /\d/.test(item.text);
}

/**
 * Check if text has a comma
 */
export function hasComma(item: TextItem): boolean {
  return item.text.includes(',');
}

/**
 * Check if text has a letter
 */
export function hasLetter(item: TextItem): boolean {
  return /[a-zA-Z]/.test(item.text);
}

/**
 * Check if text is all uppercase and has letters
 */
export function hasLetterAndIsAllUpperCase(item: TextItem): boolean {
  const text = item.text.trim();
  return /[a-zA-Z]/.test(text) && text === text.toUpperCase();
}

/**
 * Check if text has @ symbol (email)
 */
export function hasAt(item: TextItem): boolean {
  return item.text.includes('@');
}

/**
 * Check if text has parenthesis (phone number)
 */
export function hasParenthesis(item: TextItem): boolean {
  return item.text.includes('(') || item.text.includes(')');
}

/**
 * Check if text has a slash (URL)
 */
export function hasSlash(item: TextItem): boolean {
  return item.text.includes('/');
}

/**
 * Create a function to check if text contains a specific string
 */
export function getHasText(targetText: string): (item: TextItem) => boolean {
  return (item: TextItem) => item.text.includes(targetText);
}

// ============================================
// Date feature sets used in work experience and education
// ============================================

/**
 * Match year format (19xx or 20xx)
 */
export function matchYear(item: TextItem): RegExpMatchArray | null {
  return item.text.match(/(?:19|20)\d{2}/);
}

/**
 * Match month keywords
 */
export function matchMonth(item: TextItem): RegExpMatchArray | null {
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
    'oct',
    'nov',
    'dec',
    'january',
    'february',
    'march',
    'april',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const pattern = new RegExp(`\\b(${months.join('|')})\\b`, 'i');
  return item.text.match(pattern);
}

/**
 * Match season keywords
 */
export function matchSeason(item: TextItem): RegExpMatchArray | null {
  return item.text.match(/\b(spring|summer|fall|winter|autumn)\b/i);
}

/**
 * Match "Present" or "Current"
 */
export function matchPresent(item: TextItem): RegExpMatchArray | null {
  return item.text.match(/\b(present|current|now)\b/i);
}

/**
 * Date feature sets for extracting dates
 */
export const DATE_FEATURE_SETS: FeatureSet[] = [
  [matchYear, 2, true],
  [matchMonth, 2, false],
  [matchSeason, 2, false],
  [matchPresent, 2, true],
  [hasComma, -1],
];
