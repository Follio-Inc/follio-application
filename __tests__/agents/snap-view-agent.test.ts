import { describe, expect, it } from 'vitest';

import { buildSnapViewUserPrompt } from '@/services/agents/snap-view';

import type { PublicProfile } from '@/types';

function minimalProfile(): PublicProfile {
  return {
    id: 'p1',
    handle: 'ada',
    firstName: 'Ada',
    lastName: 'Lovelace',
    headline: 'Engineer',
    summary: 'Builds analytical engines',
    location: 'London',
    workExperiences: [
      {
        role: 'Engineer',
        company: 'Analytical Engines',
        location: null,
        startDate: '2020-01-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Built compilers that scaled'],
        metrics: [],
        tags: [],
      },
    ],
    educations: [],
    skills: [{ name: 'Mathematics', level: null, yearsOfExp: null }],
    skillGroups: [],
    projects: [
      {
        title: 'Difference Engine',
        description: 'Mechanical computation',
        techStack: ['Brass'],
        repoUrl: null,
        githubStars: null,
        githubForks: null,
        githubLanguage: null,
        githubTopics: [],
        featured: true,
      },
    ],
    certifications: [],
    awards: [],
  } as unknown as PublicProfile;
}

describe('buildSnapViewUserPrompt', () => {
  it('serializes core profile fields for the snap-view agent', () => {
    const prompt = buildSnapViewUserPrompt(minimalProfile());
    expect(prompt).toContain('Analyze this candidate');
    expect(prompt).toContain('Ada Lovelace');
    expect(prompt).toContain('Analytical Engines');
    expect(prompt).toContain('Difference Engine');
    expect(prompt).toContain('Mathematics');
  });
});
