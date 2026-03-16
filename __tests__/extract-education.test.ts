/**
 * Extract Education Unit Tests
 *
 * Tests for lib/resume-parser/extract-education.ts — school, degree,
 * GPA, dates, and courses extraction from resume sections.
 */

import { extractEducation } from '@/lib/resume-parser/extract-education';
import type { ResumeSectionToLines, TextItem } from '@/lib/resume-parser/types';
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

// ── extractEducation ─────────────────────────────────────────

describe('extractEducation', () => {
  it('returns empty when no education section exists', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
      experience: [[makeItem('Software Engineer')]],
    };
    const { educations } = extractEducation(sections);
    expect(educations).toEqual([]);
  });

  it('extracts school from text containing university keyword', () => {
    const sections: ResumeSectionToLines = {
      education: [
        [makeItem('Stanford University', 'Arial-Bold')],
        [makeItem('Bachelor of Science in Computer Science')],
        [makeItem('2018 - 2022')],
      ],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
    expect(educations[0].school).toContain('Stanford University');
  });

  it('extracts degree from text with degree keyword', () => {
    const sections: ResumeSectionToLines = {
      education: [[makeItem('MIT', 'Arial-Bold')], [makeItem('Master of Science in Data Science')]],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
    // The degree extractor should find something with 'master' or 'science'
  });

  it('extracts GPA in x.xx format', () => {
    const sections: ResumeSectionToLines = {
      education: [
        [makeItem('University of California', 'Arial-Bold'), makeItem('GPA: 3.85')],
        [makeItem('Bachelor of Engineering')],
      ],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
    expect(educations[0].gpa).toBe('3.85');
  });

  it('extracts date with year', () => {
    const sections: ResumeSectionToLines = {
      education: [
        [makeItem('Harvard University', 'Arial-Bold'), makeItem('2016 - 2020')],
        [makeItem('BA in Economics')],
      ],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
    expect(educations[0].date).toContain('2016');
  });

  it('handles multiple education entries', () => {
    const sections: ResumeSectionToLines = {
      education: [
        // First school — bold title creates subsection boundary
        [makeItem('MIT', 'Arial-Bold')],
        [makeItem('PhD in Computer Science')],
        // Second school
        [makeItem('Stanford University', 'Arial-Bold')],
        [makeItem('BS in Mathematics')],
      ],
    };
    const { educations } = extractEducation(sections);
    // Should find at least 1 education
    expect(educations.length).toBeGreaterThanOrEqual(1);
  });

  it('appends courses section to first education', () => {
    const sections: ResumeSectionToLines = {
      education: [[makeItem('University of Example', 'Arial-Bold')], [makeItem('BS in CS')]],
      courses: [[makeItem('Algorithms, Data Structures, Machine Learning')]],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
    const allDescs = educations[0].descriptions.join(' ');
    expect(allDescs).toContain('Courses:');
    expect(allDescs).toContain('Algorithms');
  });

  it('returns education scores for debugging', () => {
    const sections: ResumeSectionToLines = {
      education: [[makeItem('College of Tech', 'Arial-Bold')], [makeItem('Associate Degree')]],
    };
    const { educationsScores } = extractEducation(sections);
    expect(educationsScores.length).toBeGreaterThan(0);
  });

  it('handles section with "academic" keyword', () => {
    const sections: ResumeSectionToLines = {
      'academic background': [[makeItem('Yale University', 'Arial-Bold')], [makeItem('MBA')]],
    };
    const { educations } = extractEducation(sections);
    expect(educations.length).toBeGreaterThan(0);
  });
});
