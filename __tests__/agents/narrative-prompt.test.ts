import { describe, expect, it } from 'vitest';

import { assessProject } from '@/services/agents/portfolio/assess';
import { buildNarrativeUserPrompt } from '@/services/portfolio/pipeline/stage-d-narrative';

import type {
  CollectedProfileData,
  EvidenceExtraction,
  PortfolioStrategy,
  ProfileUnderstanding,
} from '@/types/portfolio';

function baseData(overrides: Partial<CollectedProfileData> = {}): CollectedProfileData {
  return {
    basics: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      headline: 'Engineer',
      summary: null,
      location: null,
      avatarUrl: null,
    },
    contact: { email: null, phone: null, website: null },
    links: [],
    workExperiences: [
      {
        company: 'Analytical Engines',
        companyUrl: null,
        companyLogo: null,
        role: 'Engineer',
        location: null,
        locationType: null,
        employmentType: null,
        startDate: '2020-01-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Built compilers'],
        tags: [],
        source: 'RESUME',
      },
    ],
    education: [],
    skills: [],
    skillGroups: [],
    projects: [
      {
        title: 'thin-repo',
        description: null,
        shortDesc: null,
        url: null,
        repoUrl: 'https://github.com/ada/thin-repo',
        imageUrl: null,
        images: [],
        techStack: ['TypeScript'],
        highlights: [],
        startDate: null,
        endDate: null,
        isCurrent: false,
        featured: true,
        source: 'GITHUB',
        github: {
          stars: 3,
          forks: 0,
          language: 'TypeScript',
          topics: [],
          owner: 'ada',
          repo: 'thin-repo',
          readme: null,
          isPinned: true,
          lastPush: null,
          license: null,
          watchers: 0,
        },
      },
    ],
    blogPosts: [],
    youtubeVideos: [],
    awards: [],
    certifications: [],
    github: null,
    photos: [],
    connectedSources: [],
    meta: {
      collectedAt: new Date().toISOString(),
      profileId: 'p1',
      handle: 'ada',
      activeSources: ['RESUME', 'GITHUB'],
      completeness: 0.5,
    },
    ...overrides,
  };
}

const understanding: ProfileUnderstanding = {
  primaryArchetype: 'engineer',
  secondaryArchetypes: [],
  identitySummary: 'Engineer who builds tools',
  definingThemes: ['compilers'],
  careerStage: 'mid-career',
  uniqueAngles: ['early computing'],
  domains: ['software'],
  dataRichness: {
    overall: 0.5,
    sections: {
      basics: 0.5,
      experience: 0.5,
      education: 0,
      skills: 0,
      projects: 0.4,
      writing: 0,
      github: 0.4,
      awards: 0,
      certifications: 0,
    },
  },
  _meta: {
    stage: 'profileUnderstanding',
    model: 'test',
    tokensUsed: { input: 0, output: 0 },
    durationMs: 0,
    timestamp: new Date().toISOString(),
  },
};

const evidence: EvidenceExtraction = {
  topEvidence: [],
  measurableOutcomes: [],
  technicalCredibility: [],
  leadershipSignals: [],
  writingAssessment: null,
  openSourceCredibility: null,
  mustFeature: ['thin-repo'],
  weakItems: [],
  _meta: {
    stage: 'evidenceExtraction',
    model: 'test',
    tokensUsed: { input: 0, output: 0 },
    durationMs: 0,
    timestamp: new Date().toISOString(),
  },
};

const strategy: PortfolioStrategy = {
  pageCount: 1,
  pages: [
    {
      slug: 'home',
      label: 'Home',
      purpose: 'highlights',
      sectionTypes: [
        'hero',
        'about',
        'featured-projects',
        'blog-showcase',
        'github-showcase',
        'contact',
      ],
      isPrimary: true,
      minimumItemsRequired: 0,
    },
  ],
  contentDensity: 'moderate',
  leadWith: 'projects',
  tone: 'technical',
  hookStrategy: 'Lead with craft',
  _meta: {
    stage: 'portfolioStrategy',
    model: 'test',
    tokensUsed: { input: 0, output: 0 },
    durationMs: 0,
    timestamp: new Date().toISOString(),
  },
};

describe('buildNarrativeUserPrompt', () => {
  it('embeds section policies and project quality strategies', () => {
    const assessment = assessProject({
      id: '1',
      title: 'thin-repo',
      description: null,
      techStack: ['TypeScript'],
      github: { stars: 3, isPinned: true },
    });

    const prompt = buildNarrativeUserPrompt(baseData(), understanding, evidence, strategy, {
      projectAssessments: [assessment],
      attachedSourceKinds: ['resume', 'github'],
      focusNotes: 'Emphasize systems thinking',
    });

    expect(prompt).toContain('Section writing policies');
    expect(prompt).toContain('## Experience');
    expect(prompt).toContain('## Projects');
    expect(prompt).toContain('quality=');
    expect(prompt).toContain('Strategy:');
    expect(prompt).toContain('Emphasize systems thinking');
    expect(prompt).toContain('Writing attached: no');
    expect(prompt).toContain('GitHub attached: yes');
    const introsLine = prompt.match(/## Sections that Need Intros\n([^\n]*)/)?.[1] ?? '';
    expect(introsLine).not.toContain('blog-showcase');
    expect(introsLine).toContain('featured-projects');
  });

  it('keeps writing guidance when writing is attached', () => {
    const data = baseData({
      blogPosts: [
        {
          title: 'Notes on engines',
          url: 'https://medium.com/@ada/notes',
          excerpt: null,
          content: null,
          thumbnail: null,
          author: null,
          publishedAt: null,
          tags: [],
          readTimeMin: null,
          claps: null,
          platform: 'medium',
          platformIcon: null,
          isFeatured: false,
          source: 'MEDIUM',
        },
      ],
    });

    const prompt = buildNarrativeUserPrompt(data, understanding, evidence, strategy, {
      attachedSourceKinds: ['resume', 'github', 'writing'],
    });

    expect(prompt).toContain('Writing attached: yes');
    expect(prompt).toContain('Notes on engines');
  });
});
