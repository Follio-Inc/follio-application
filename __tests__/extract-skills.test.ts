/**
 * Extract Skills Unit Tests
 *
 * Tests for lib/resume-parser/extract-skills.ts — skill parsing and extraction.
 */

import {
  extractIndividualSkills,
  extractSkills,
  parseSkillsFromText,
} from '@/lib/resume-parser/extract-skills';
import type { ResumeSectionToLines, TextItem } from '@/lib/resume-parser/types';
import { describe, expect, it } from 'vitest';

// ── Helpers ──────────────────────────────────────────────────

const makeItem = (text: string, fontName = 'Arial', y = 100, hasEOL = false): TextItem => ({
  text,
  x: 0,
  y,
  width: text.length * 8,
  height: 12,
  fontName,
  hasEOL,
});

// ── parseSkillsFromText ──────────────────────────────────────

describe('parseSkillsFromText', () => {
  it('splits by comma', () => {
    expect(parseSkillsFromText('Python, Java, TypeScript')).toEqual([
      'Python',
      'Java',
      'TypeScript',
    ]);
  });

  it('splits by semicolon', () => {
    expect(parseSkillsFromText('React; Next.js; Tailwind')).toEqual([
      'React',
      'Next.js',
      'Tailwind',
    ]);
  });

  it('splits by pipe', () => {
    expect(parseSkillsFromText('Docker|Kubernetes|AWS')).toEqual(['Docker', 'Kubernetes', 'AWS']);
  });

  it('splits by bullet character •', () => {
    expect(parseSkillsFromText('Go•Rust•C++')).toEqual(['Go', 'Rust', 'C++']);
  });

  it('splits by middle dot ·', () => {
    expect(parseSkillsFromText('HTML·CSS·JavaScript')).toEqual(['HTML', 'CSS', 'JavaScript']);
  });

  it('filters out empty strings', () => {
    expect(parseSkillsFromText('Python,,Java, ,TypeScript')).toEqual([
      'Python',
      'Java',
      'TypeScript',
    ]);
  });

  it('filters out overly long items (50+ chars)', () => {
    const longText = 'x'.repeat(51);
    expect(parseSkillsFromText(`Python, ${longText}, Java`)).toEqual(['Python', 'Java']);
  });

  it('trims whitespace', () => {
    expect(parseSkillsFromText('  Python  , Java  ')).toEqual(['Python', 'Java']);
  });

  it('returns empty array for empty string', () => {
    expect(parseSkillsFromText('')).toEqual([]);
  });
});

// ── extractIndividualSkills ──────────────────────────────────

describe('extractIndividualSkills', () => {
  it('parses categorized skills (colon-separated)', () => {
    const result = extractIndividualSkills(['Languages: Python, Java, Go']);
    expect(result).toEqual(['Python', 'Java', 'Go']);
  });

  it('parses non-categorized skills', () => {
    const result = extractIndividualSkills(['React, Node.js, Express']);
    expect(result).toEqual(['React', 'Node.js', 'Express']);
  });

  it('handles multiple description lines', () => {
    const result = extractIndividualSkills([
      'Languages: Python, Java',
      'Frameworks: React, Django',
    ]);
    expect(result).toEqual(['Python', 'Java', 'React', 'Django']);
  });

  it('deduplicates skills', () => {
    const result = extractIndividualSkills(['Languages: Python, Java', 'Tools: Python, Docker']);
    expect(result).toContain('Python');
    // Python should appear only once
    expect(result.filter((s) => s === 'Python')).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(extractIndividualSkills([])).toEqual([]);
  });

  it('handles colon with nothing after it', () => {
    const result = extractIndividualSkills(['Languages:']);
    expect(result).toEqual([]);
  });
});

// ── extractSkills (integration with sections) ────────────────

describe('extractSkills', () => {
  it('returns default empty skills when no skills section exists', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
      experience: [[makeItem('Software Engineer')]],
    };
    const { skills } = extractSkills(sections);
    expect(skills.featuredSkills).toHaveLength(6);
    expect(skills.featuredSkills.every((fs) => fs.skill === '')).toBe(true);
    expect(skills.descriptions).toEqual([]);
  });

  it('extracts skills from a skills section', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
      skills: [[makeItem('• Python, Java, Go')], [makeItem('• React, Next.js, TypeScript')]],
    };
    const { skills } = extractSkills(sections);
    expect(skills.descriptions.length).toBeGreaterThan(0);
  });

  it('extracts skills from section with "technical" keyword', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
      'technical skills': [[makeItem('Python, Java, Go')]],
    };
    const { skills } = extractSkills(sections);
    expect(skills.descriptions.length).toBeGreaterThan(0);
  });

  it('handles sections with bullet points', () => {
    const sections: ResumeSectionToLines = {
      skills: [[makeItem('• Languages: Python, Java')], [makeItem('• Frameworks: React, Django')]],
    };
    const { skills } = extractSkills(sections);
    expect(skills.descriptions.length).toBe(2);
  });

  it('falls back to joining text when no bullet points found', () => {
    const sections: ResumeSectionToLines = {
      skills: [[makeItem('Python Java Go React')]],
    };
    const { skills } = extractSkills(sections);
    expect(skills.descriptions.length).toBeGreaterThan(0);
    expect(skills.descriptions[0]).toContain('Python');
  });
});
