/**
 * Group Lines Into Sections Unit Tests
 *
 * Tests for lib/resume-parser/group-lines-into-sections.ts — section title
 * detection and grouping logic.
 */

import {
  PROFILE_SECTION,
  getSectionLinesByKeywords,
  groupLinesIntoSections,
  isBold,
} from '@/lib/resume-parser/group-lines-into-sections';
import type { Lines, TextItem } from '@/lib/resume-parser/types';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────

const makeItem = (text: string, fontName = 'Arial', y = 100): TextItem => ({
  text,
  x: 0,
  y,
  width: text.length * 8,
  height: 12,
  fontName,
  hasEOL: false,
});

// ── isBold ───────────────────────────────────────────────────

describe('isBold (group-lines-into-sections)', () => {
  it('returns true for bold fontName', () => {
    expect(isBold(makeItem('text', 'Arial-Bold'))).toBe(true);
  });

  it('returns true for heavy fontName', () => {
    expect(isBold(makeItem('text', 'Helvetica-Heavy'))).toBe(true);
  });

  it('returns true for black fontName', () => {
    expect(isBold(makeItem('text', 'Roboto-Black'))).toBe(true);
  });

  it('returns false for regular fontName', () => {
    expect(isBold(makeItem('text', 'Arial'))).toBe(false);
  });
});

// ── PROFILE_SECTION ──────────────────────────────────────────

describe('PROFILE_SECTION constant', () => {
  it('equals "profile"', () => {
    expect(PROFILE_SECTION).toBe('profile');
  });
});

// ── groupLinesIntoSections ────────────────────────────────────

describe('groupLinesIntoSections', () => {
  it('assigns initial lines to profile section', () => {
    const lines: Lines = [[makeItem('John Doe', 'Arial-Bold')], [makeItem('john@example.com')]];
    const sections = groupLinesIntoSections(lines);
    expect(sections[PROFILE_SECTION]).toBeDefined();
    expect(sections[PROFILE_SECTION]).toHaveLength(2);
  });

  it('detects bold uppercase section headers', () => {
    const lines: Lines = [
      [makeItem('John Doe', 'Arial-Bold')], // profile content (idx 0)
      [makeItem('john@example.com')], // profile content (idx 1)
      [makeItem('EXPERIENCE', 'Arial-Bold')], // section header (idx 2)
      [makeItem('Software Engineer at Acme')], // section content
    ];
    const sections = groupLinesIntoSections(lines);
    expect(sections[PROFILE_SECTION]).toBeDefined();
    expect(sections['experience']).toBeDefined();
    expect(sections['experience']).toHaveLength(1);
    expect(sections['experience'][0][0].text).toBe('Software Engineer at Acme');
  });

  it('handles multiple sections', () => {
    const lines: Lines = [
      [makeItem('John Doe', 'Arial-Bold')],
      [makeItem('Location')],
      [makeItem('EXPERIENCE', 'Arial-Bold')],
      [makeItem('Engineer at Corp')],
      [makeItem('EDUCATION', 'Arial-Bold')],
      [makeItem('MIT')],
      [makeItem('SKILLS', 'Arial-Bold')],
      [makeItem('Python, Java')],
    ];
    const sections = groupLinesIntoSections(lines);
    expect(Object.keys(sections)).toContain('experience');
    expect(Object.keys(sections)).toContain('education');
    expect(Object.keys(sections)).toContain('skills');
  });

  it('does not treat first two lines as section headers', () => {
    // Even if bold+uppercase, lines 0 and 1 should be profile
    const lines: Lines = [
      [makeItem('JOHN DOE', 'Arial-Bold')],
      [makeItem('SOFTWARE ENGINEER', 'Arial-Bold')],
      [makeItem('EXPERIENCE', 'Arial-Bold')],
      [makeItem('Worked at Acme')],
    ];
    const sections = groupLinesIntoSections(lines);
    // "JOHN DOE" and "SOFTWARE ENGINEER" should be in profile, not as section names
    expect(sections[PROFILE_SECTION]).toBeDefined();
    expect(sections['experience']).toBeDefined();
  });

  it('returns empty sections for empty lines', () => {
    const sections = groupLinesIntoSections([]);
    expect(Object.keys(sections)).toHaveLength(0);
  });

  it('handles section title with keyword match even if not uppercase', () => {
    const lines: Lines = [
      [makeItem('Name', 'Arial-Bold')],
      [makeItem('Email')],
      [makeItem('Experience', 'Arial-Bold')],
      [makeItem('Some job')],
    ];
    const sections = groupLinesIntoSections(lines);
    expect(sections['experience']).toBeDefined();
  });

  it('ignores short text as section title', () => {
    const lines: Lines = [
      [makeItem('Name', 'Arial-Bold')],
      [makeItem('Details')],
      [makeItem('OK', 'Arial-Bold')], // too short (< 3 chars)
      [makeItem('More content')],
    ];
    const sections = groupLinesIntoSections(lines);
    // "OK" should not be treated as a section
    expect(sections['ok']).toBeUndefined();
  });
});

// ── getSectionLinesByKeywords ────────────────────────────────

describe('getSectionLinesByKeywords', () => {
  it('returns lines for matching section', () => {
    const sections = {
      experience: [[makeItem('Engineer at Corp')]] as Lines,
      education: [[makeItem('MIT')]] as Lines,
    };
    const result = getSectionLinesByKeywords(sections, ['experience']);
    expect(result).toHaveLength(1);
    expect(result[0][0].text).toBe('Engineer at Corp');
  });

  it('matches partial keywords', () => {
    const sections = {
      'work experience': [[makeItem('Job description')]] as Lines,
    };
    const result = getSectionLinesByKeywords(sections, ['experience', 'work']);
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no section matches', () => {
    const sections = {
      education: [[makeItem('MIT')]] as Lines,
    };
    const result = getSectionLinesByKeywords(sections, ['skills']);
    expect(result).toHaveLength(0);
  });

  it('returns the first matching section', () => {
    const sections = {
      'technical skills': [[makeItem('Python')]] as Lines,
      skills: [[makeItem('Java')]] as Lines,
    };
    const result = getSectionLinesByKeywords(sections, ['skill']);
    // Should return the first match
    expect(result).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    const sections = {
      EXPERIENCE: [[makeItem('Job')]] as Lines,
    };
    const result = getSectionLinesByKeywords(sections, ['experience']);
    // The section key "EXPERIENCE" should match keyword "experience"
    expect(result).toHaveLength(1);
  });
});
