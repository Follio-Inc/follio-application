/**
 * Step 3: Group lines into sections
 * Based on OpenResume's group-lines-into-sections.ts
 *
 * Identifies section headers and groups content under them
 */

import type { Line, Lines, ResumeSectionToLines, TextItem } from './types';

export const PROFILE_SECTION = 'profile';

/**
 * Primary section keywords - most common resume sections
 */
const SECTION_TITLE_PRIMARY_KEYWORDS = ['experience', 'education', 'project', 'skill'];

/**
 * Secondary section keywords - less common but valid sections
 */
const SECTION_TITLE_SECONDARY_KEYWORDS = [
  'job',
  'work',
  'employment',
  'career',
  'professional',
  'course',
  'training',
  'extracurricular',
  'activity',
  'activities',
  'objective',
  'summary',
  'profile',
  'about',
  'award',
  'honor',
  'achievement',
  'certification',
  'certificate',
  'license',
  'volunteer',
  'leadership',
  'involvement',
  'interest',
  'publication',
  'language',
  'technical',
  'competenc',
  'qualif',
  'additional',
];

const SECTION_TITLE_KEYWORDS = [
  ...SECTION_TITLE_PRIMARY_KEYWORDS,
  ...SECTION_TITLE_SECONDARY_KEYWORDS,
];

/**
 * Check if text item is bold based on font name
 */
export function isBold(item: TextItem): boolean {
  const fontName = item.fontName.toLowerCase();
  return fontName.includes('bold') || fontName.includes('heavy') || fontName.includes('black');
}

/**
 * Check if text has only letters, spaces, and ampersands (common for section titles)
 */
function hasOnlyLettersSpacesAmpersands(item: TextItem): boolean {
  return /^[a-zA-Z\s&]+$/.test(item.text.trim());
}

/**
 * Check if text has letters and is all uppercase
 */
function hasLetterAndIsAllUpperCase(item: TextItem): boolean {
  const text = item.text.trim();
  return /[a-zA-Z]/.test(text) && text === text.toUpperCase();
}

/**
 * Group lines into sections based on section title detection
 */
export function groupLinesIntoSections(lines: Lines): ResumeSectionToLines {
  const sections: ResumeSectionToLines = {};
  let currentSectionName = PROFILE_SECTION;
  let currentSectionLines: Lines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line[0]?.text.trim() || '';

    if (isSectionTitle(line, i)) {
      // Save current section
      if (currentSectionLines.length > 0 || currentSectionName === PROFILE_SECTION) {
        sections[currentSectionName] = [...currentSectionLines];
      }

      // Start new section
      currentSectionName = text.toLowerCase();
      currentSectionLines = [];
    } else {
      currentSectionLines.push(line);
    }
  }

  // Save last section
  if (currentSectionLines.length > 0) {
    sections[currentSectionName] = [...currentSectionLines];
  }

  return sections;
}

/**
 * Determine if a line is a section title
 * Main heuristic: bold + uppercase + only text item in line
 * Fallback: keyword matching
 */
function isSectionTitle(line: Line, lineIndex: number): boolean {
  // Skip first few lines (likely profile info)
  if (lineIndex < 2) return false;

  const firstItem = line[0];
  if (!firstItem) return false;

  const text = firstItem.text.trim();

  // Skip very short or very long text
  if (text.length < 3 || text.length > 50) return false;

  // Skip if contains numbers or special characters typical of content
  if (/[@.:\d]/.test(text) && !text.includes(':')) return false;

  // Main heuristic: single bold uppercase text item
  if (line.length === 1) {
    const itemIsBold = isBold(firstItem);
    const itemIsUpperCase = hasLetterAndIsAllUpperCase(firstItem);
    const itemHasValidChars = hasOnlyLettersSpacesAmpersands(firstItem);

    // If both bold and uppercase, very likely a section title
    if (itemIsBold && itemIsUpperCase) return true;

    // If bold and has valid characters, check for keywords
    if (itemIsBold && itemHasValidChars) {
      if (matchesSectionKeyword(text)) return true;
    }

    // If uppercase and matches keyword
    if (itemIsUpperCase && matchesSectionKeyword(text)) return true;
  }

  // Fallback: check if the text matches a section keyword
  // Even for multi-item lines, the first item might be a section title
  if (matchesSectionKeyword(text)) {
    // Additional check: should be relatively short and not look like content
    if (text.split(/\s+/).length <= 4) {
      // Check if it's emphasized in some way
      if (isBold(firstItem) || hasLetterAndIsAllUpperCase(firstItem)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if text matches any section keyword
 */
function matchesSectionKeyword(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SECTION_TITLE_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/**
 * Get section lines by keywords
 */
export function getSectionLinesByKeywords(
  sections: ResumeSectionToLines,
  keywords: string[]
): Lines {
  for (const sectionName in sections) {
    const hasKeyword = keywords.some((keyword) => sectionName.toLowerCase().includes(keyword));
    if (hasKeyword) {
      return sections[sectionName];
    }
  }
  return [];
}
