/**
 * Helper functions for extracting content from lines
 * Based on OpenResume's bullet-points.ts and subsections.ts
 */

import { isBold } from './feature-scoring-system';
import type { Lines, Subsections } from './types';

/**
 * Common bullet point characters
 */
export const BULLET_POINTS = [
  '•',
  '## ',
  '## *',
  '*',
  '-',
  '–',
  '—',
  '→',
  '➤',
  '➢',
  '►',
  '▪',
  '▸',
  '⋅',
  '∙',
  '🞄',
  '⦁',
  '⚫︎',
  '●',
  '⬤',
  '⚬',
  '○',
  '◦',
  '◉',
  '◈',
  '✦',
  '✧',
];

/**
 * Divide lines into subsections (e.g., multiple work experiences)
 * Uses line gap or bold text to detect subsection boundaries
 */
export function divideSectionIntoSubsections(lines: Lines): Subsections {
  if (lines.length === 0) return [];

  // Calculate the most common line gap
  const lineGaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prevLine = lines[i - 1];
    const currLine = lines[i];
    if (prevLine[0] && currLine[0]) {
      const gap = Math.round(prevLine[0].y - currLine[0].y);
      if (gap > 0) lineGaps.push(gap);
    }
  }

  // Find the most common line gap
  const gapCounts = new Map<number, number>();
  for (const gap of lineGaps) {
    gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
  }

  let mostCommonGap = 12; // Default
  let maxCount = 0;
  for (const [gap, count] of gapCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonGap = gap;
    }
  }

  // Subsection threshold is 1.4x the common gap
  const subsectionThreshold = mostCommonGap * 1.4;

  // First try: use line gap to detect subsections
  let subsections = createSubsectionsByLineGap(lines, subsectionThreshold);

  // Fallback: if only one subsection, try using bold text as boundary
  if (subsections.length === 1) {
    subsections = createSubsectionsByBold(lines);
  }

  return subsections;
}

/**
 * Create subsections based on line gap
 */
function createSubsectionsByLineGap(lines: Lines, threshold: number): Subsections {
  const subsections: Subsections = [];
  let currentSubsection: Lines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0) {
      currentSubsection.push(line);
      continue;
    }

    const prevLine = lines[i - 1];
    const gap = prevLine[0] && line[0] ? Math.round(prevLine[0].y - line[0].y) : 0;

    if (gap > threshold) {
      // New subsection
      if (currentSubsection.length > 0) {
        subsections.push(currentSubsection);
      }
      currentSubsection = [line];
    } else {
      currentSubsection.push(line);
    }
  }

  if (currentSubsection.length > 0) {
    subsections.push(currentSubsection);
  }

  return subsections;
}

/**
 * Create subsections based on bold text
 */
function createSubsectionsByBold(lines: Lines): Subsections {
  const subsections: Subsections = [];
  let currentSubsection: Lines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const firstItem = line[0];

    if (i === 0) {
      currentSubsection.push(line);
      continue;
    }

    const prevLine = lines[i - 1];
    const prevFirstItem = prevLine[0];

    // New subsection if current line starts with bold and previous didn't
    const isNewSubsection =
      firstItem &&
      prevFirstItem &&
      !isBold(prevFirstItem) &&
      isBold(firstItem) &&
      !BULLET_POINTS.includes(firstItem.text.trim());

    if (isNewSubsection) {
      if (currentSubsection.length > 0) {
        subsections.push(currentSubsection);
      }
      currentSubsection = [line];
    } else {
      currentSubsection.push(line);
    }
  }

  if (currentSubsection.length > 0) {
    subsections.push(currentSubsection);
  }

  return subsections;
}

/**
 * Get the line index where bullet points/descriptions start
 */
export function getDescriptionsLineIdx(lines: Lines): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const firstItem = line[0];
    if (firstItem && isBulletPoint(firstItem.text.trim())) {
      return i;
    }
  }
  return undefined;
}

/**
 * Check if text starts with a bullet point
 */
function isBulletPoint(text: string): boolean {
  const firstChar = text[0];
  if (BULLET_POINTS.includes(firstChar)) return true;

  // Check for numbered lists (1., 2., etc.)
  if (/^\d+[.)\]]/.test(text)) return true;

  return false;
}

/**
 * Convert bullet point lines to descriptions
 */
export function getBulletPointsFromLines(lines: Lines): string[] {
  const firstBulletIdx = getFirstBulletPointLineIdx(lines);

  // If no bullet points, just join all text
  if (firstBulletIdx === undefined) {
    return lines
      .map((line) =>
        line
          .map((item) => item.text)
          .join(' ')
          .trim()
      )
      .filter(Boolean);
  }

  // Combine all text and split by bullet points
  let allText = '';
  for (const line of lines) {
    for (const item of line) {
      // Add space between words if needed
      if (allText && !allText.endsWith(' ') && !item.text.startsWith(' ')) {
        allText += ' ';
      }
      allText += item.text;
    }
    allText += ' ';
  }

  // Split by bullet points
  const descriptions: string[] = [];
  let currentDesc = '';

  for (let i = 0; i < allText.length; i++) {
    const char = allText[i];

    if (BULLET_POINTS.includes(char)) {
      if (currentDesc.trim()) {
        descriptions.push(cleanDescription(currentDesc));
      }
      currentDesc = '';
    } else {
      currentDesc += char;
    }
  }

  if (currentDesc.trim()) {
    descriptions.push(cleanDescription(currentDesc));
  }

  return descriptions.filter((d) => d.length > 0);
}

/**
 * Get index of first line with a bullet point
 */
function getFirstBulletPointLineIdx(lines: Lines): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const firstItem = line[0];
    if (firstItem && BULLET_POINTS.includes(firstItem.text.trim()[0])) {
      return i;
    }
  }
  return undefined;
}

/**
 * Clean up a description string
 */
function cleanDescription(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^\s*[-–—•]\s*/, '') // Remove leading bullet/dash
    .trim();
}

/**
 * Get text content from lines
 */
export function getTextFromLines(lines: Lines): string {
  return lines
    .map((line) => line.map((item) => item.text).join(' '))
    .join(' ')
    .trim();
}
