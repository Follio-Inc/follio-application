/**
 * Extract Profile Unit Tests
 *
 * Tests for lib/resume-parser/extract-profile.ts — name, email, phone,
 * location, URL, and summary extraction from resume profile section.
 */

import { extractProfile } from '@/lib/resume-parser/extract-profile';
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

// ── extractProfile ───────────────────────────────────────────

describe('extractProfile', () => {
  it('extracts name from bold text', () => {
    const sections: ResumeSectionToLines = {
      profile: [
        [makeItem('John Doe', 'Arial-Bold')],
        [makeItem('john@example.com')],
        [makeItem('(555) 123-4567')],
      ],
    };
    const { profile } = extractProfile(sections);
    expect(profile.name).toBe('John Doe');
  });

  it('extracts email with @ symbol', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Jane Smith', 'Arial-Bold')], [makeItem('jane@gmail.com')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.email).toContain('@');
    expect(profile.email).toBe('jane@gmail.com');
  });

  it('extracts phone number in (xxx) xxx-xxxx format', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Alice')], [makeItem('(555) 123-4567')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.phone).toBe('(555) 123-4567');
  });

  it('extracts phone number in xxx-xxx-xxxx format', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Bob')], [makeItem('555-123-4567')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.phone).toContain('555');
  });

  it('extracts location in City, ST format', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Charlie', 'Arial-Bold')], [makeItem('San Francisco, CA')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.location).toBe('San Francisco, CA');
  });

  it('extracts URL', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Dave', 'Arial-Bold')], [makeItem('github.com/dave')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.url).toContain('github.com');
  });

  it('extracts URL with http prefix', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Eva', 'Arial-Bold')], [makeItem('https://linkedin.com/in/eva')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.url).toContain('linkedin.com');
  });

  it('returns empty strings when section is empty', () => {
    const sections: ResumeSectionToLines = {};
    const { profile } = extractProfile(sections);
    expect(profile.name).toBe('');
    expect(profile.email).toBe('');
    expect(profile.phone).toBe('');
    expect(profile.location).toBe('');
    expect(profile.url).toBe('');
    expect(profile.summary).toBe('');
  });

  it('extracts summary from dedicated summary section', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Frank', 'Arial-Bold')]],
      summary: [
        [
          makeItem(
            'Experienced software engineer with 10 years of experience building scalable web applications.'
          ),
        ],
      ],
    };
    const { profile } = extractProfile(sections);
    expect(profile.summary).toContain('Experienced software engineer');
  });

  it('extracts summary from objective section', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('Grace', 'Arial-Bold')]],
      objective: [[makeItem('Seeking a challenging role in full-stack development')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.summary).toContain('Seeking a challenging role');
  });

  it('prefers dedicated summary section over inline summary', () => {
    const sections: ResumeSectionToLines = {
      profile: [
        [makeItem('Helen', 'Arial-Bold')],
        [makeItem('This is an inline summary with plenty of words for detection')],
      ],
      summary: [[makeItem('This is the dedicated section summary text')]],
    };
    const { profile } = extractProfile(sections);
    expect(profile.summary).toContain('dedicated section summary');
  });

  it('returns profile scores for debugging', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe', 'Arial-Bold')], [makeItem('john@example.com')]],
    };
    const { profileScores } = extractProfile(sections);
    expect(profileScores).toHaveProperty('nameScores');
    expect(profileScores).toHaveProperty('emailScores');
    expect(profileScores).toHaveProperty('phoneScores');
    expect(profileScores).toHaveProperty('locationScores');
    expect(profileScores).toHaveProperty('urlScores');
    expect(profileScores).toHaveProperty('summaryScores');
  });

  it('handles a complete profile section', () => {
    const sections: ResumeSectionToLines = {
      profile: [
        [makeItem('JOHN DOE', 'Arial-Bold')],
        [makeItem('john.doe@email.com'), makeItem('(415) 555-1234')],
        [makeItem('San Francisco, CA'), makeItem('github.com/johndoe')],
      ],
    };
    const { profile } = extractProfile(sections);
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.email).toContain('@');
  });
});
