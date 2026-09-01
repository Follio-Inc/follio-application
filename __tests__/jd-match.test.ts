import { describe, expect, it } from 'vitest';

import { buildResumeCorpus } from '@/lib/jd-match/build-resume-corpus';
import {
  inferJobTitleHint,
  scoreProfilesAgainstJd,
  scoreResumeAgainstJd,
} from '@/lib/jd-match/score';
import { bandFromScore, tokenize } from '@/lib/jd-match/tokenize';

const baseProfile = {
  id: 'p1',
  handle: 'ada-lovelace',
  resumeTitle: 'Backend Engineer',
  headline: 'Senior Backend Engineer',
  summary: 'Build APIs and data platforms.',
  skills: [
    { name: 'TypeScript', isVisible: true },
    { name: 'Node.js', isVisible: true },
    { name: 'PostgreSQL', isVisible: true },
    { name: 'Kubernetes', isVisible: true },
  ],
  workExperiences: [
    {
      company: 'Acme',
      role: 'Senior Backend Engineer',
      bullets: ['Designed REST APIs', 'Scaled PostgreSQL'],
      isVisible: true,
    },
  ],
  projects: [
    {
      title: 'Ops Platform',
      techStack: ['TypeScript', 'Kubernetes'],
      highlights: ['Cut deploy time'],
      isVisible: true,
      showOnResume: true,
    },
  ],
  educations: [
    {
      institution: 'MIT',
      degree: 'BS',
      fieldOfStudy: 'Computer Science',
      isVisible: true,
    },
  ],
  certifications: [],
};

describe('jd-match tokenize', () => {
  it('drops stopwords and keeps tech tokens', () => {
    const tokens = tokenize('The engineer must know TypeScript and the team');
    expect(tokens).toContain('engineer');
    expect(tokens).toContain('typescript');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
  });

  it('maps score bands', () => {
    expect(bandFromScore(80)).toBe('strong');
    expect(bandFromScore(60)).toBe('good');
    expect(bandFromScore(40)).toBe('fair');
    expect(bandFromScore(10)).toBe('weak');
  });
});

describe('jd-match scoring', () => {
  it('scores a strong backend JD highly for a backend resume', () => {
    const jd = `
      Senior Backend Engineer
      Responsibilities
      - Design REST APIs in TypeScript and Node.js
      - Operate PostgreSQL and Kubernetes
      Requirements
      - 5+ years backend engineering experience
    `;

    const result = scoreResumeAgainstJd(buildResumeCorpus(baseProfile), jd);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(['strong', 'good']).toContain(result.band);
    expect(result.matchedSkills.map((s) => s.toLowerCase())).toEqual(
      expect.arrayContaining(['typescript', 'node.js', 'postgresql'])
    );
  });

  it('scores a mismatched JD weaker', () => {
    const jd = `
      Senior Brand Designer
      Requirements
      - Figma, illustration, brand systems, typography
      - Motion design in After Effects
    `;

    const result = scoreResumeAgainstJd(buildResumeCorpus(baseProfile), jd);
    expect(result.score).toBeLessThan(55);
    expect(['fair', 'weak']).toContain(result.band);
  });

  it('ranks multiple resumes by score', () => {
    const designProfile = {
      ...baseProfile,
      id: 'p2',
      handle: 'design-resume',
      resumeTitle: 'Product Designer',
      headline: 'Product Designer',
      skills: [
        { name: 'Figma', isVisible: true },
        { name: 'Typography', isVisible: true },
      ],
      workExperiences: [
        {
          company: 'Studio',
          role: 'Product Designer',
          bullets: ['Built design systems in Figma'],
          isVisible: true,
        },
      ],
      projects: [],
    };

    const jd = `
      Product Designer
      Requirements: Figma, typography, design systems
    `;

    const ranked = scoreProfilesAgainstJd([baseProfile, designProfile], jd);
    expect(ranked[0]?.resumeId).toBe('p2');
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });

  it('infers a job title hint when present', () => {
    expect(
      inferJobTitleHint('Senior Platform Engineer\n\nAbout the role\nYou will build…')
    ).toMatch(/Platform Engineer/i);
  });
});
