import { describe, expect, it } from 'vitest';

import { buildResumeCorpus } from '@/lib/jd-match/build-resume-corpus';
import { scoreResumeAgainstJd } from '@/lib/jd-match/score';
import {
  MAX_LENS_PHRASES,
  buildRecruiterStrip,
  buildResumeLens,
  findNonOverlappingRanges,
  formatPhraseHint,
  isLikelyUrlOnly,
  phraseAppearsIn,
  splitTextByRanges,
  validateJobDescription,
} from '@/lib/resume-lens';
import type { LensProfile } from '@/lib/resume-lens';

const backendProfile: LensProfile = {
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
    { name: 'Go', isVisible: true },
  ],
  workExperiences: [
    {
      company: 'Stripe',
      role: 'Senior Backend Engineer',
      bullets: ['Designed REST APIs in TypeScript', 'Operated Kubernetes and PostgreSQL'],
      isVisible: true,
      isCurrent: true,
      startDate: '2022-01-01T00:00:00.000Z',
      endDate: null,
    },
    {
      company: 'Acme',
      role: 'Backend Engineer',
      bullets: ['Scaled PostgreSQL'],
      isVisible: true,
      isCurrent: false,
      startDate: '2019-01-01T00:00:00.000Z',
      endDate: '2021-12-01T00:00:00.000Z',
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

const backendJd = `
  Senior Backend Engineer
  Responsibilities
  - Design REST APIs in TypeScript and Node.js
  - Operate PostgreSQL and Kubernetes
  Requirements
  - 5+ years backend engineering experience
  - Terraform is required
`;

describe('resume-lens validate JD', () => {
  it('rejects empty, short, and URL-only pastes', () => {
    expect(validateJobDescription('').ok).toBe(false);
    expect(validateJobDescription('too short').ok).toBe(false);
    expect(isLikelyUrlOnly('https://jobs.example.com/role/123')).toBe(true);
    const url = validateJobDescription('https://boards.greenhouse.io/acme/jobs/99');
    expect(url.ok).toBe(false);
    if (!url.ok) expect(url.message).toMatch(/not the link/i);
  });

  it('accepts a real job description', () => {
    const parsed = validateJobDescription(backendJd);
    expect(parsed.ok).toBe(true);
  });
});

describe('resume-lens highlight ranges', () => {
  it('does not match Go inside Google', () => {
    expect(phraseAppearsIn('Worked at Google on search', 'Go')).toBe(false);
    expect(phraseAppearsIn('Wrote APIs in Go and Rust', 'Go')).toBe(true);
  });

  it('prefers the longer overlapping phrase', () => {
    const ranges = findNonOverlappingRanges('Built machine learning pipelines', [
      { id: 'a', phrase: 'learning' },
      { id: 'b', phrase: 'machine learning' },
    ]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.phraseId).toBe('b');
    const segments = splitTextByRanges('Built machine learning pipelines', ranges);
    expect(segments).toEqual([
      { type: 'text', value: 'Built ' },
      { type: 'mark', value: 'machine learning', phraseId: 'b' },
      { type: 'text', value: ' pipelines' },
    ]);
  });

  it('matches C++ and Node.js', () => {
    const text = 'Shipped Node.js services and a C++ parser';
    const ranges = findNonOverlappingRanges(text, [
      { id: 'n', phrase: 'Node.js' },
      { id: 'c', phrase: 'C++' },
    ]);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['Node.js', 'C++']);
  });
});

describe('resume-lens build', () => {
  it('highlights matched skills, not generic job words', () => {
    const lens = buildResumeLens(backendProfile, backendJd);
    const phrases = lens.phrases.map((p) => p.phrase.toLowerCase());

    expect(phrases).toEqual(expect.arrayContaining(['typescript', 'kubernetes', 'postgresql']));
    expect(phrases).not.toContain('engineer');
    expect(phrases).not.toContain('senior');
    expect(lens.phrases.length).toBeGreaterThan(0);
    expect(lens.phrases.length).toBeLessThanOrEqual(MAX_LENS_PHRASES);
  });

  it('writes recruiter-facing strip copy without applicant coaching', () => {
    const lens = buildResumeLens(backendProfile, backendJd);
    expect(lens.strip).toMatch(/strong on/i);
    expect(lens.strip.toLowerCase()).not.toContain('applying');
    expect(lens.strip.toLowerCase()).not.toContain('tailoring');
    expect(lens.strip.toLowerCase()).not.toContain('another resume');
  });

  it('indexes where a skill appears and explains current tenure', () => {
    const lens = buildResumeLens(backendProfile, backendJd);
    const kube = lens.phrases.find((p) => /kubernetes/i.test(p.phrase));
    expect(kube).toBeTruthy();
    expect(kube!.occurrences.some((o) => o.kind === 'skill')).toBe(true);
    expect(kube!.occurrences.some((o) => /stripe/i.test(o.label))).toBe(true);
    expect(formatPhraseHint(kube!)).toMatch(/currently at Stripe/i);
  });

  it('keeps highlights sparse even when the JD lists many tools', () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => ({
      name: `Skill${i}`,
      isVisible: true,
    }));
    const profile: LensProfile = {
      ...backendProfile,
      skills: [...backendProfile.skills, ...manySkills],
      workExperiences: [
        {
          ...backendProfile.workExperiences[0]!,
          bullets: [
            ...(backendProfile.workExperiences[0]!.bullets ?? []),
            ...manySkills.map((s) => `Used ${s.name}`),
          ],
        },
      ],
    };
    const jd = `Senior Backend Engineer\nRequirements\n${manySkills.map((s) => `- ${s.name}`).join('\n')}\n- TypeScript`;
    const lens = buildResumeLens(profile, jd);
    expect(lens.phrases.length).toBeLessThanOrEqual(MAX_LENS_PHRASES);
  });

  it('does not use hidden experience in occurrence labels', () => {
    const profile: LensProfile = {
      ...backendProfile,
      workExperiences: [
        ...backendProfile.workExperiences,
        {
          company: 'Secret Co',
          role: 'Staff Engineer',
          bullets: ['Kubernetes internals'],
          isVisible: false,
        },
      ],
    };
    const lens = buildResumeLens(profile, backendJd);
    const kube = lens.phrases.find((p) => /kubernetes/i.test(p.phrase));
    expect(kube?.occurrences.some((o) => /secret/i.test(o.label))).toBe(false);
  });
});

describe('resume-lens strip helper', () => {
  it('formats strong / light lists', () => {
    expect(buildRecruiterStrip(['TypeScript', 'Go'], ['Terraform'])).toBe(
      'Strong on TypeScript and Go. Light on Terraform.'
    );
    expect(buildRecruiterStrip([], [])).toBe('No clear overlap with this role.');
  });
});

describe('resume-lens scoring stays independent', () => {
  it('still scores the same corpus the extension uses', () => {
    const result = scoreResumeAgainstJd(buildResumeCorpus(backendProfile), backendJd);
    expect(result.matchedSkills.map((s) => s.toLowerCase())).toEqual(
      expect.arrayContaining(['typescript', 'kubernetes'])
    );
  });
});
