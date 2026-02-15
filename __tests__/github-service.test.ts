/**
 * GitHub Service Unit Tests
 *
 * Tests for services/github.service.ts — pure utility functions
 * (aggregateLanguages, extractTopics) and fetch-dependent functions with mocks.
 */

import type { GitHubRepo, GitHubUser } from '@/services/github.service';
import {
  aggregateLanguages,
  extractTopics,
  fetchGitHubRepos,
  fetchGitHubUser,
  normalizeGitHubData,
} from '@/services/github.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Test data factories ──────────────────────────────────────

function makeRepo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    id: 1,
    name: 'my-project',
    full_name: 'user/my-project',
    description: 'A cool project',
    html_url: 'https://github.com/user/my-project',
    homepage: null,
    language: 'TypeScript',
    languages_url: 'https://api.github.com/repos/user/my-project/languages',
    stargazers_count: 10,
    forks_count: 2,
    topics: ['web', 'typescript'],
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    pushed_at: '2024-01-01T00:00:00Z',
    fork: false,
    archived: false,
    ...overrides,
  };
}

function makeUser(overrides: Partial<GitHubUser> = {}): GitHubUser {
  return {
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    bio: 'Passionate developer',
    location: 'San Francisco',
    company: 'Acme Inc',
    blog: 'https://testuser.dev',
    avatar_url: 'https://avatars.githubusercontent.com/u/1234',
    html_url: 'https://github.com/testuser',
    public_repos: 25,
    followers: 100,
    following: 50,
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── aggregateLanguages ───────────────────────────────────────

describe('aggregateLanguages', () => {
  it('aggregates and sorts languages by frequency', () => {
    const repos = [
      makeRepo({ language: 'TypeScript' }),
      makeRepo({ language: 'Python' }),
      makeRepo({ language: 'TypeScript' }),
      makeRepo({ language: 'Python' }),
      makeRepo({ language: 'TypeScript' }),
      makeRepo({ language: 'Go' }),
    ];
    const result = aggregateLanguages(repos);
    expect(result[0]).toBe('TypeScript'); // most frequent
    expect(result[1]).toBe('Python');
    expect(result[2]).toBe('Go');
  });

  it('returns empty array for repos with no languages', () => {
    const repos = [makeRepo({ language: null }), makeRepo({ language: null })];
    expect(aggregateLanguages(repos)).toEqual([]);
  });

  it('returns empty array for empty repos list', () => {
    expect(aggregateLanguages([])).toEqual([]);
  });

  it('handles single repo', () => {
    const repos = [makeRepo({ language: 'Rust' })];
    expect(aggregateLanguages(repos)).toEqual(['Rust']);
  });

  it('skips null languages', () => {
    const repos = [
      makeRepo({ language: 'JavaScript' }),
      makeRepo({ language: null }),
      makeRepo({ language: 'JavaScript' }),
    ];
    const result = aggregateLanguages(repos);
    expect(result).toEqual(['JavaScript']);
    expect(result).toHaveLength(1);
  });
});

// ── extractTopics ────────────────────────────────────────────

describe('extractTopics', () => {
  it('aggregates and sorts topics by frequency', () => {
    const repos = [
      makeRepo({ topics: ['react', 'web'] }),
      makeRepo({ topics: ['react', 'api'] }),
      makeRepo({ topics: ['react', 'web', 'graphql'] }),
    ];
    const result = extractTopics(repos);
    expect(result[0]).toBe('react'); // most frequent (3)
    expect(result[1]).toBe('web'); // second (2)
  });

  it('limits to 20 topics', () => {
    const manyTopics = Array.from({ length: 25 }, (_, i) => `topic-${i}`);
    const repos = [makeRepo({ topics: manyTopics })];
    const result = extractTopics(repos);
    expect(result).toHaveLength(20);
  });

  it('returns empty array for repos with no topics', () => {
    const repos = [makeRepo({ topics: [] })];
    expect(extractTopics(repos)).toEqual([]);
  });

  it('returns empty array for empty repos list', () => {
    expect(extractTopics([])).toEqual([]);
  });

  it('deduplicates topics across repos', () => {
    const repos = [makeRepo({ topics: ['react'] }), makeRepo({ topics: ['react'] })];
    const result = extractTopics(repos);
    expect(result).toEqual(['react']);
  });
});

// ── fetchGitHubUser (with fetch mock) ────────────────────────

describe('fetchGitHubUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches user data from GitHub API', async () => {
    const mockUser = makeUser();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockUser),
    });

    const result = await fetchGitHubUser('testuser');
    expect(result).toEqual(mockUser);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/users/testuser',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'Follio-App',
        }),
      })
    );
  });

  it('includes auth header when access token provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeUser()),
    });

    await fetchGitHubUser('testuser', 'my-token');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('throws for 404 with descriptive message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(fetchGitHubUser('nonexistent')).rejects.toThrow(
      'GitHub user "nonexistent" not found'
    );
  });

  it('throws for other error status codes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await expect(fetchGitHubUser('testuser')).rejects.toThrow('GitHub API error: 500');
  });
});

// ── fetchGitHubRepos (with fetch mock) ───────────────────────

describe('fetchGitHubRepos', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out forks and archived repos', async () => {
    const repos = [
      makeRepo({ name: 'original', fork: false, archived: false, stargazers_count: 5 }),
      makeRepo({ name: 'forked', fork: true, archived: false, stargazers_count: 100 }),
      makeRepo({ name: 'old', fork: false, archived: true, stargazers_count: 50 }),
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(repos),
    });

    const result = await fetchGitHubRepos('testuser');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('original');
  });

  it('sorts by stars descending', async () => {
    const repos = [
      makeRepo({ name: 'low', stargazers_count: 1 }),
      makeRepo({ name: 'high', stargazers_count: 100 }),
      makeRepo({ name: 'mid', stargazers_count: 50 }),
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(repos),
    });

    const result = await fetchGitHubRepos('testuser');
    expect(result[0].name).toBe('high');
    expect(result[1].name).toBe('mid');
    expect(result[2].name).toBe('low');
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(fetchGitHubRepos('testuser')).rejects.toThrow('GitHub API error: 403');
  });
});

// ── normalizeGitHubData (integration with mocked fetch) ──────

describe('normalizeGitHubData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes user and repo data into profile format', async () => {
    const user = makeUser({ name: 'Alice Wonder', blog: 'https://alice.dev' });
    const repos = [
      makeRepo({
        name: 'cool-project',
        description: 'My cool project',
        stargazers_count: 42,
        language: 'TypeScript',
        topics: ['react', 'nextjs'],
      }),
    ];

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(repos) });

    const result = await normalizeGitHubData('alicewonder');

    // Profile
    expect(result.profile.firstName).toBe('Alice');
    expect(result.profile.lastName).toBe('Wonder');
    expect(result.profile.headline).toBe('Passionate developer');
    expect(result.profile.location).toBe('San Francisco');

    // Links
    expect(result.links.length).toBeGreaterThanOrEqual(2); // GitHub + blog
    expect(result.links[0].type).toBe('GITHUB');
    expect(result.links[1].type).toBe('WEBSITE');

    // Projects
    expect(result.projects.length).toBe(1);
    expect(result.projects[0].title).toBe('Cool project'); // hyphen replaced, capitalized
    expect(result.projects[0].ghStars).toBe(42);
    expect(result.projects[0].techStack).toContain('TypeScript');

    // Skills
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.some((s) => s.name === 'TypeScript')).toBe(true);

    // Meta
    expect(result._meta.source).toBe('GITHUB');
    expect(result._meta.username).toBe('alicewonder');
  });

  it('handles user with no name', async () => {
    const user = makeUser({ name: null, login: 'anon' });
    const repos: GitHubRepo[] = [];

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(repos) });

    const result = await normalizeGitHubData('anon');
    expect(result.profile.firstName).toBe('anon');
    expect(result.profile.lastName).toBeUndefined();
  });

  it('handles user with no blog', async () => {
    const user = makeUser({ blog: null });
    const repos: GitHubRepo[] = [];

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(repos) });

    const result = await normalizeGitHubData('testuser');
    // Should only have GitHub link, no website
    expect(result.links).toHaveLength(1);
    expect(result.links[0].type).toBe('GITHUB');
  });

  it('prepends https:// to blog if no protocol', async () => {
    const user = makeUser({ blog: 'my-blog.com' });
    const repos: GitHubRepo[] = [];

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(repos) });

    const result = await normalizeGitHubData('testuser');
    const websiteLink = result.links.find((l) => l.type === 'WEBSITE');
    expect(websiteLink?.url).toBe('https://my-blog.com');
  });

  it('marks top 3 starred repos as featured', async () => {
    const repos = Array.from({ length: 5 }, (_, i) =>
      makeRepo({
        id: i,
        name: `project-${i}`,
        stargazers_count: 10 - i,
        language: 'Go',
        topics: [],
      })
    );

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makeUser()) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(repos) });

    const result = await normalizeGitHubData('testuser');
    expect(result.projects[0].featured).toBe(true);
    expect(result.projects[1].featured).toBe(true);
    expect(result.projects[2].featured).toBe(true);
    expect(result.projects[3].featured).toBe(false);
    expect(result.projects[4].featured).toBe(false);
  });

  it('sets contactInfo when user has email', async () => {
    const user = makeUser({ email: 'alice@example.com' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const result = await normalizeGitHubData('alice');
    expect(result.contactInfo?.email).toBe('alice@example.com');
  });

  it('sets contactInfo to undefined when user has no email', async () => {
    const user = makeUser({ email: null });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(user) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });

    const result = await normalizeGitHubData('testuser');
    expect(result.contactInfo).toBeUndefined();
  });
});
