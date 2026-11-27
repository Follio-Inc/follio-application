/**
 * Deterministic resume quality analysis.
 *
 * This module is what the Evaluation Agent's numbers rest on, so it is tested
 * directly rather than only through the agent: if the analyser is wrong, the
 * agent reports the wrong thing confidently.
 */

import { describe, expect, it } from 'vitest';

import { analyzeResumeQuality } from '@/lib/resume-quality/analyze';

import type { ResumeForQuality } from '@/lib/resume-quality/types';

function buildResume(overrides: Partial<ResumeForQuality> = {}): ResumeForQuality {
  return {
    headline: 'Senior Backend Engineer',
    summary: 'Builds APIs and data platforms.',
    contact: { email: 'ada@example.com', phone: null, website: null },
    experiences: [
      {
        id: 'exp1',
        company: 'Acme',
        role: 'Senior Backend Engineer',
        bullets: ['Migrated 12 services onto Kubernetes', 'Designed the billing REST API'],
      },
    ],
    education: [{ id: 'edu1', institution: 'MIT', degree: 'BS' }],
    skills: ['TypeScript', 'PostgreSQL'],
    projects: [
      {
        id: 'proj1',
        title: 'Ops Platform',
        description: 'Internal deploy tooling with a long enough description to read as adequate.',
        highlights: ['Cut deploy time'],
        techStack: ['TypeScript'],
      },
    ],
    ...overrides,
  };
}

function codesAt(report: ReturnType<typeof analyzeResumeQuality>, code: string) {
  return report.findings.filter((finding) => finding.code === code);
}

describe('section completeness', () => {
  it('reports every empty section', () => {
    const report = analyzeResumeQuality(
      buildResume({
        headline: null,
        summary: '   ',
        contact: { email: null, phone: null, website: null },
        experiences: [],
        education: [],
        skills: [],
        projects: [],
      })
    );

    expect(report.missingSections).toEqual([
      'headline',
      'summary',
      'contact email',
      'work experience',
      'education',
      'skills',
      'projects',
    ]);
    expect(report.counts).toMatchObject({ experiences: 0, education: 0, skills: 0, projects: 0 });
  });

  it('reports nothing missing on a complete resume', () => {
    expect(analyzeResumeQuality(buildResume()).missingSections).toEqual([]);
  });

  it('ranks missing experience and skills above the rest', () => {
    const report = analyzeResumeQuality(buildResume({ experiences: [], headline: null }));
    const missing = codesAt(report, 'missing-section');

    expect(missing.find((f) => f.location === 'work experience')?.severity).toBe('high');
    expect(missing.find((f) => f.location === 'headline')?.severity).toBe('medium');
  });
});

describe('bullet analysis', () => {
  it('detects numbers, percentages and currency as measurable results', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: [
              'Cut latency by 40%',
              'Saved $2M in cloud spend',
              'Shipped 3 services',
              'Improved the deployment process substantially',
            ],
          },
        ],
      })
    );

    expect(report.counts.totalBullets).toBe(4);
    expect(report.counts.bulletsWithMetrics).toBe(3);
    expect(report.metricCoveragePercent).toBe(75);
  });

  it('flags a role whose bullets never state a number', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['Built the reporting pipeline end to end for the analytics team'],
          },
        ],
      })
    );

    expect(codesAt(report, 'no-metrics')).toHaveLength(1);
    expect(report.metricCoveragePercent).toBe(0);
    // Phrased as a statement about the text, never about the person's impact.
    expect(codesAt(report, 'no-metrics')[0].detail).toMatch(/does not mention a number|no bullet/i);
  });

  it('finds filler phrases and quotes the resume’s own words as evidence', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['Responsible for various backend services and worked on the platform'],
          },
        ],
      })
    );

    const weak = codesAt(report, 'weak-phrasing');
    expect(weak).toHaveLength(1);
    expect(weak[0].detail).toContain('responsible for');
    expect(weak[0].evidence).toContain('Responsible for');
  });

  it('flags a bullet that buries the verb', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['The team delivered a new onboarding flow across 3 platforms'],
          },
        ],
      })
    );

    expect(codesAt(report, 'weak-opener')).toHaveLength(1);
  });

  it('accepts a bullet that opens with an action verb', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['Delivered a new onboarding flow across 3 platforms'],
          },
        ],
      })
    );

    expect(codesAt(report, 'weak-opener')).toHaveLength(0);
  });

  it('flags bullets that are too long or too short', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['Shipped 2 APIs', `Delivered ${'x'.repeat(320)} with 4 teams`],
          },
        ],
      })
    );

    expect(codesAt(report, 'short-bullet')).toHaveLength(1);
    expect(codesAt(report, 'long-bullet')).toHaveLength(1);
  });

  it('flags a role with no bullets at all', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [{ id: 'e', company: 'Acme', role: 'Engineer', bullets: [] }],
      })
    );

    const finding = codesAt(report, 'no-bullets')[0];
    expect(finding.severity).toBe('high');
    expect(finding.location).toBe('Engineer @ Acme');
    expect(report.experiences[0].quality).toBe('empty');
  });

  it('strips HTML before measuring', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          {
            id: 'e',
            company: 'Acme',
            role: 'Engineer',
            bullets: ['<p>Delivered <strong>3</strong> services to production safely</p>'],
          },
        ],
      })
    );

    expect(report.experiences[0].bullets[0].text).not.toContain('<');
    expect(report.experiences[0].bullets[0].hasMetric).toBe(true);
  });
});

describe('report shape', () => {
  it('orders findings most severe first', () => {
    const report = analyzeResumeQuality(
      buildResume({
        experiences: [
          { id: 'e1', company: 'Acme', role: 'Engineer', bullets: [] },
          {
            id: 'e2',
            company: 'Globex',
            role: 'Developer',
            bullets: ['Responsible for the build system and various chores'],
          },
        ],
        skills: [],
      })
    );

    const rank = { high: 0, medium: 1, low: 2 } as const;
    const severities = report.findings.map((finding) => rank[finding.severity]);
    expect([...severities]).toEqual([...severities].sort((a, b) => a - b));
  });

  it('carries a basis that does not read as an ATS verdict', () => {
    const report = analyzeResumeQuality(buildResume());

    expect(report.basis).toMatch(/deterministic checks/i);
    expect(report.basis).toMatch(/not a score from any applicant tracking system/i);
  });

  it('is reproducible for the same input', () => {
    expect(analyzeResumeQuality(buildResume())).toEqual(analyzeResumeQuality(buildResume()));
  });

  it('handles an entirely empty resume without throwing', () => {
    const report = analyzeResumeQuality({
      headline: null,
      summary: null,
      contact: { email: null, phone: null, website: null },
      experiences: [],
      education: [],
      skills: [],
      projects: [],
    });

    expect(report.counts.totalBullets).toBe(0);
    expect(report.metricCoveragePercent).toBe(0);
    expect(report.findings.length).toBeGreaterThan(0);
  });
});
