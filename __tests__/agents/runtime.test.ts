import { describe, expect, it } from 'vitest';

import { createAgentMemory } from '@/lib/agents/memory';
import { zodToOpenAIParameters } from '@/lib/agents/define-tool';
import { assessExperience, assessProject } from '@/services/agents/portfolio/assess';
import { listAttachedSources } from '@/services/agents/portfolio/sources';
import { getSectionPolicy, listSectionPolicies } from '@/services/agents/portfolio/policies';
import { z } from 'zod';

import type { CollectedProfileData } from '@/types/portfolio';

function emptyCollected(overrides: Partial<CollectedProfileData> = {}): CollectedProfileData {
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
    workExperiences: [],
    education: [],
    skills: [],
    skillGroups: [],
    projects: [],
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
      activeSources: ['RESUME'],
      completeness: 0.4,
    },
    ...overrides,
  };
}

describe('agent memory', () => {
  it('stores and retrieves values', () => {
    const memory = createAgentMemory({ a: 1 });
    expect(memory.get('a')).toBe(1);
    memory.set('b', { ok: true });
    expect(memory.get<{ ok: boolean }>('b')?.ok).toBe(true);
  });
});

describe('zodToOpenAIParameters', () => {
  it('converts object schemas for tool calling', () => {
    const schema = z.object({
      profileId: z.string(),
      optionalNote: z.string().optional(),
    });
    const json = zodToOpenAIParameters(schema);
    expect(json.type).toBe('object');
    expect((json.properties as Record<string, unknown>).profileId).toEqual({ type: 'string' });
    expect(json.required).toContain('profileId');
    expect(json.required).not.toContain('optionalNote');
  });
});

describe('portfolio section policies', () => {
  it('exposes distinct policies for experience vs projects', () => {
    const experience = getSectionPolicy('experience');
    const projects = getSectionPolicy('projects');
    expect(experience.rules.some((r) => r.toLowerCase().includes('bullet'))).toBe(true);
    expect(projects.thinDataStrategy.toLowerCase()).toContain('empty');
    expect(listSectionPolicies().length).toBeGreaterThan(5);
  });
});

describe('content quality assessment', () => {
  it('marks empty project descriptions as empty/thin', () => {
    const empty = assessProject({
      id: '1',
      title: 'demo-repo',
      description: null,
      techStack: ['TypeScript'],
      github: { stars: 2, isPinned: false },
    });
    expect(['empty', 'thin']).toContain(empty.quality);

    const rich = assessProject({
      id: '2',
      title: 'payments',
      description:
        'Built a payment orchestration layer that routes transactions across providers with idempotent retries and observability.',
      highlights: ['Cut latency 30%'],
      techStack: ['Go', 'Kafka'],
      github: { stars: 120, readme: 'x'.repeat(200), isPinned: true },
    });
    expect(rich.quality).toBe('rich');
  });

  it('assesses experience bullet richness', () => {
    const thin = assessExperience({
      id: 'e1',
      role: 'Engineer',
      company: 'Acme',
      bullets: ['Did stuff'],
    });
    expect(['thin', 'empty']).toContain(thin.quality);
  });
});

describe('listAttachedSources', () => {
  it('reports writing as attached when blog posts exist', () => {
    const withPosts = listAttachedSources(
      emptyCollected({
        blogPosts: [
          {
            title: 'Hello',
            url: 'https://medium.com/@ada/hello',
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
      })
    );
    const writing = withPosts.find((s) => s.kind === 'writing');
    expect(writing?.attached).toBe(true);
    expect(writing?.itemCount).toBe(1);
  });

  it('skips writing when no posts are attached', () => {
    const sources = listAttachedSources(emptyCollected());
    expect(sources.find((s) => s.kind === 'writing')?.attached).toBe(false);
  });

  it('reports GitHub attached when aggregate profile exists', () => {
    const sources = listAttachedSources(
      emptyCollected({
        github: {
          username: 'ada',
          avatarUrl: null,
          htmlUrl: 'https://github.com/ada',
          bio: 'Builder',
          company: null,
          blog: null,
          location: null,
          publicRepos: 12,
          followers: 100,
          following: 10,
          totalStars: 50,
          totalForks: 5,
          primaryLanguages: ['TypeScript'],
          languageStats: { TypeScript: 80 },
          contributionStats: null,
          organizations: [],
        },
      })
    );
    const github = sources.find((s) => s.kind === 'github');
    expect(github?.attached).toBe(true);
    expect(github?.notes?.some((n) => n.includes('@ada'))).toBe(true);
  });
});
