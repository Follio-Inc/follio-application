/**
 * Extract Project Unit Tests
 *
 * Tests for lib/resume-parser/extract-project.ts — project name,
 * date, and description extraction.
 */

import { extractProject } from '@/lib/resume-parser/extract-project';
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

// ── extractProject ───────────────────────────────────────────

describe('extractProject', () => {
  it('returns empty when no projects section exists', () => {
    const sections: ResumeSectionToLines = {
      profile: [[makeItem('John Doe')]],
      experience: [[makeItem('Some job')]],
    };
    const { projects } = extractProject(sections);
    expect(projects).toEqual([]);
  });

  it('extracts project name from bold text', () => {
    const sections: ResumeSectionToLines = {
      projects: [
        [makeItem('Chat Application', 'Arial-Bold')],
        [makeItem('2023')],
        [makeItem('• Built real-time chat using WebSockets')],
      ],
    };
    const { projects } = extractProject(sections);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].project).toContain('Chat Application');
  });

  it('extracts date from header', () => {
    const sections: ResumeSectionToLines = {
      projects: [
        [makeItem('E-commerce Platform', 'Arial-Bold')],
        [makeItem('Jan 2023 - May 2023')],
        [makeItem('• Developed checkout system')],
      ],
    };
    const { projects } = extractProject(sections);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].date).toContain('2023');
  });

  it('extracts descriptions as bullet points', () => {
    const sections: ResumeSectionToLines = {
      projects: [
        [makeItem('My App', 'Arial-Bold')],
        [makeItem('• Feature A')],
        [makeItem('• Feature B')],
        [makeItem('• Feature C')],
      ],
    };
    const { projects } = extractProject(sections);
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0].descriptions.length).toBeGreaterThanOrEqual(2);
  });

  it('handles "portfolio" keyword in section name', () => {
    const sections: ResumeSectionToLines = {
      portfolio: [
        [makeItem('Website Redesign', 'Arial-Bold')],
        [makeItem('• Redesigned company website')],
      ],
    };
    const { projects } = extractProject(sections);
    expect(projects.length).toBeGreaterThan(0);
  });

  it('skips entries with no meaningful data', () => {
    const sections: ResumeSectionToLines = {
      projects: [[makeItem('')]],
    };
    const { projects } = extractProject(sections);
    expect(projects).toHaveLength(0);
  });

  it('returns scores for debugging', () => {
    const sections: ResumeSectionToLines = {
      projects: [[makeItem('Cool Project', 'Arial-Bold')], [makeItem('• Did something')]],
    };
    const { projectsScores } = extractProject(sections);
    expect(projectsScores.length).toBeGreaterThan(0);
  });

  it('handles multiple projects', () => {
    const sections: ResumeSectionToLines = {
      projects: [
        [makeItem('Project Alpha', 'Arial-Bold')],
        [makeItem('• Built API')],
        [makeItem('Project Beta', 'Arial-Bold')],
        [makeItem('• Built frontend')],
      ],
    };
    const { projects } = extractProject(sections);
    // Should find at least 1 project
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });
});
