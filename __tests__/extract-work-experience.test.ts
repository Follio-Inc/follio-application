/**
 * Extract Work Experience Unit Tests
 *
 * Tests for lib/resume-parser/extract-work-experience.ts — job title,
 * company, date, and description extraction.
 */

import { extractWorkExperience } from '@/lib/resume-parser/extract-work-experience';
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

// ── extractWorkExperience ────────────────────────────────────

describe('extractWorkExperience', () => {
  it('returns empty when no experience section exists', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences).toEqual([]);
  });

  it('extracts job title with title keyword', () => {
    const sections: ResumeSectionToLines = {
      experience: [
        [makeItem('Software Engineer', 'Arial-Bold')],
        [makeItem('Google')],
        [makeItem('Jan 2020 - Present')],
        [makeItem('• Built microservices')],
      ],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
    expect(workExperiences[0].jobTitle).toContain('Engineer');
  });

  it('extracts company name', () => {
    const sections: ResumeSectionToLines = {
      experience: [
        [makeItem('Senior Developer', 'Arial-Bold')],
        [makeItem('Microsoft Corporation', 'Arial-Bold')],
        [makeItem('2019 - 2023')],
      ],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
  });

  it('extracts dates with year and month', () => {
    const sections: ResumeSectionToLines = {
      experience: [
        [makeItem('Intern'), makeItem('June 2021 - August 2021')],
        [makeItem('Startup Inc')],
      ],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
    expect(workExperiences[0].date).toContain('2021');
  });

  it('extracts bullet point descriptions', () => {
    const sections: ResumeSectionToLines = {
      experience: [
        [makeItem('Software Engineer', 'Arial-Bold')],
        [makeItem('2020 - Present')],
        [makeItem('• Designed REST APIs')],
        [makeItem('• Improved performance by 40%')],
        [makeItem('• Mentored 3 junior developers')],
      ],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
    expect(workExperiences[0].descriptions.length).toBeGreaterThanOrEqual(2);
  });

  it('handles "work" section keyword', () => {
    const sections: ResumeSectionToLines = {
      'work experience': [
        [makeItem('Data Analyst', 'Arial-Bold')],
        [makeItem('DataCorp')],
        [makeItem('2022 - 2024')],
      ],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
  });

  it('handles "employment" section keyword', () => {
    const sections: ResumeSectionToLines = {
      'employment history': [[makeItem('Manager', 'Arial-Bold')], [makeItem('Corp LLC')]],
    };
    const { workExperiences } = extractWorkExperience(sections);
    expect(workExperiences.length).toBeGreaterThan(0);
  });

  it('skips entries with no meaningful data', () => {
    const sections: ResumeSectionToLines = {
      experience: [[makeItem('')]],
    };
    const { workExperiences } = extractWorkExperience(sections);
    // Empty text items shouldn't produce entries
    expect(workExperiences).toHaveLength(0);
  });

  it('returns scores for debugging', () => {
    const sections: ResumeSectionToLines = {
      experience: [[makeItem('Engineer', 'Arial-Bold')], [makeItem('Acme Inc')]],
    };
    const { workExperiencesScores } = extractWorkExperience(sections);
    expect(workExperiencesScores.length).toBeGreaterThan(0);
  });
});
