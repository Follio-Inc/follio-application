/**
 * Step 2: Group text items into lines
 * Based on OpenResume's group-text-items-into-lines.ts
 *
 * This handles two main issues:
 * 1. Text items can be broken into multiple pieces (e.g., phone number split)
 * 2. Text items lack context - we need to group them by visual lines
 */

import type { Line, Lines, TextItem, TextItems } from './types';

/**
 * Group text items into lines based on their y-position and connect adjacent items
 */
export function groupTextItemsIntoLines(textItems: TextItems): Lines {
  if (textItems.length === 0) return [];

  // Calculate average character width for connecting adjacent text items
  const avgCharWidth = computeAvgCharWidth(textItems);

  // Sort by y position (descending - top to bottom) then by x position (left to right)
  const sortedItems = [...textItems].sort((a, b) => {
    // Round y to handle slight variations
    const yDiff = Math.round(b.y) - Math.round(a.y);
    if (yDiff !== 0) return yDiff;
    return a.x - b.x;
  });

  const lines: Lines = [];
  let currentLine: Line = [];
  let currentY: number | null = null;

  for (const item of sortedItems) {
    // Start new line if y position changes significantly
    if (currentY === null || Math.abs(item.y - currentY) > 5) {
      if (currentLine.length > 0) {
        lines.push(connectAdjacentTextItems(currentLine, avgCharWidth));
      }
      currentLine = [item];
      currentY = item.y;
    } else {
      currentLine.push(item);
    }
  }

  // Don't forget the last line
  if (currentLine.length > 0) {
    lines.push(connectAdjacentTextItems(currentLine, avgCharWidth));
  }

  return lines;
}

/**
 * Compute average character width from all text items
 * Used to determine if adjacent items should be connected
 */
function computeAvgCharWidth(textItems: TextItems): number {
  let totalWidth = 0;
  let totalChars = 0;

  for (const item of textItems) {
    // Skip items that are bolded or have unusual fonts (can skew results)
    const fontName = item.fontName.toLowerCase();
    if (fontName.includes('bold') || fontName.includes('symbol')) continue;

    const charCount = item.text.length;
    if (charCount > 0 && item.width > 0) {
      totalWidth += item.width;
      totalChars += charCount;
    }
  }

  return totalChars > 0 ? totalWidth / totalChars : 5; // Default to 5 if no data
}

/**
 * Connect adjacent text items that are close together
 * This fixes issues like phone numbers being split: "(123)" "456" "-7890"
 */
function connectAdjacentTextItems(line: Line, avgCharWidth: number): Line {
  if (line.length <= 1) return line;

  // Sort by x position
  const sortedLine = [...line].sort((a, b) => a.x - b.x);
  const connectedLine: Line = [];
  let currentItem: TextItem | null = null;

  for (const item of sortedLine) {
    if (currentItem === null) {
      currentItem = { ...item };
      continue;
    }

    // Calculate distance between items
    const dist: number = item.x - (currentItem.x + currentItem.width);

    // Connect if distance is less than 1.5x average character width
    const shouldConnect = dist < avgCharWidth * 1.5 && dist > -avgCharWidth;

    if (shouldConnect) {
      // Merge items: add space if there's a gap
      const sep: string = dist > avgCharWidth * 0.3 ? ' ' : '';
      currentItem = {
        ...currentItem,
        text: currentItem.text + sep + item.text,
        width: item.x + item.width - currentItem.x,
        hasEOL: item.hasEOL,
      };
    } else {
      connectedLine.push(currentItem);
      currentItem = { ...item };
    }
  }

  if (currentItem) {
    connectedLine.push(currentItem);
  }

  return connectedLine;
}

/**
 * Get the full text content of a line
 */
export function getLineText(line: Line): string {
  return line
    .map((item) => item.text)
    .join(' ')
    .trim();
}

/**
 * Get all text from lines as a single string
 */
export function getLinesText(lines: Lines): string {
  return lines.map((line) => getLineText(line)).join('\n');
}
