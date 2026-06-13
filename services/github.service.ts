/**
 * GitHub Integration Service
 *
 * Fetches user data, repositories, and contribution data from GitHub.
 * Normalizes data for profile merging.
 */

import { logger } from '@/lib/logger';
import type { GitHubRepo, GitHubUser } from '@/types';

const githubLogger = logger.child({ source: 'github-service' });

const GITHUB_API_BASE = 'https://api.github.com';

// Re-export types for backward compatibility
export type { GitHubRepo, GitHubUser };

export interface GitHubLanguages {
  [language: string]: number; // bytes of code
}

export interface NormalizedGitHubData {
  profile: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
  };
  contactInfo?: {
    email?: string;
  };
  links: {
    type: string;
    url: string;
    label: string;
    source: 'GITHUB';
  }[];
  projects: {
    title: string;
    description?: string;
    shortDesc?: string;
    url?: string;
    repoUrl: string;
    techStack: string[];
    featured: boolean;
    sortOrder: number;
    source: 'GITHUB';
    ghStars?: number;
    ghForks?: number;
    ghLanguage?: string;
  }[];
  skills: {
    name: string;
    category?: string;
    sortOrder: number;
    source: 'GITHUB';
  }[];
  _meta: {
    source: 'GITHUB';
    username: string;
    fetchedAt: Date;
  };
}

/**
 * Fetch GitHub user profile
 */
export async function fetchGitHubUser(username: string, accessToken?: string): Promise<GitHubUser> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Follio-App',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}/users/${username}`, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`GitHub user "${username}" not found`);
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch user's public repositories
 */
export async function fetchGitHubRepos(
  username: string,
  accessToken?: string,
  options: { perPage?: number; sort?: 'stars' | 'updated' | 'pushed' } = {}
): Promise<GitHubRepo[]> {
  const { perPage = 30, sort = 'stars' } = options;

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Follio-App',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const params = new URLSearchParams({
    per_page: perPage.toString(),
    sort: sort === 'stars' ? 'pushed' : sort, // GitHub doesn't support sort by stars directly
    direction: 'desc',
  });

  const response = await fetch(`${GITHUB_API_BASE}/users/${username}/repos?${params}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const repos: GitHubRepo[] = await response.json();

  // Filter out forks and archived repos, then sort by stars
  return repos
    .filter((repo) => !repo.fork && !repo.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count);
}

/**
 * Get aggregated language statistics across all repos
 */
export function aggregateLanguages(repos: GitHubRepo[]): string[] {
  const languageCounts: Record<string, number> = {};

  repos.forEach((repo) => {
    if (repo.language) {
      languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
    }
  });

  // Sort by frequency and return top languages
  return Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

/**
 * Extract unique topics/technologies from repos
 */
export function extractTopics(repos: GitHubRepo[]): string[] {
  const topicCounts: Record<string, number> = {};

  repos.forEach((repo) => {
    repo.topics.forEach((topic) => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });

  return Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic]) => topic);
}

/**
 * Normalize GitHub data to profile format
 */
export async function normalizeGitHubData(
  username: string,
  accessToken?: string
): Promise<NormalizedGitHubData> {
  // Fetch user and repos in parallel
  const [user, repos] = await Promise.all([
    fetchGitHubUser(username, accessToken),
    fetchGitHubRepos(username, accessToken, { perPage: 50 }),
  ]);

  // Parse name
  const nameParts =
    user.name
      ?.split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0) || [];
  const firstName = nameParts[0] || username;
  const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined;
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

  // Get languages and topics
  const languages = aggregateLanguages(repos);
  const topics = extractTopics(repos);

  // Create links
  const links: NormalizedGitHubData['links'] = [
    {
      type: 'GITHUB',
      url: user.html_url,
      label: 'GitHub',
      source: 'GITHUB',
    },
  ];

  if (user.blog) {
    links.push({
      type: 'WEBSITE',
      url: user.blog.startsWith('http') ? user.blog : `https://${user.blog}`,
      label: 'Website',
      source: 'GITHUB',
    });
  }

  // Convert repos to projects (top starred repos)
  const projects = repos.slice(0, 10).map((repo, index) => ({
    title: repo.name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    description: repo.description || undefined,
    shortDesc: repo.description?.slice(0, 100) || undefined,
    url: repo.homepage || undefined,
    repoUrl: repo.html_url,
    techStack: [repo.language, ...repo.topics].filter(Boolean) as string[],
    featured: index < 3 && repo.stargazers_count > 0,
    sortOrder: index,
    source: 'GITHUB' as const,
    ghStars: repo.stargazers_count,
    ghForks: repo.forks_count,
    ghLanguage: repo.language || undefined,
  }));

  // Create skills from languages and topics
  const skills = [
    ...languages.slice(0, 10).map((lang, index) => ({
      name: lang,
      category: 'Languages',
      sortOrder: index,
      source: 'GITHUB' as const,
    })),
    ...topics.slice(0, 10).map((topic, index) => ({
      name: topic,
      category: 'Technologies',
      sortOrder: languages.length + index,
      source: 'GITHUB' as const,
    })),
  ];

  return {
    profile: {
      firstName,
      middleName,
      lastName,
      headline: user.bio || `${firstName} on GitHub`,
      summary: user.bio || undefined,
      location: user.location || undefined,
      avatarUrl: user.avatar_url,
    },
    contactInfo: user.email ? { email: user.email } : undefined,
    links,
    projects,
    skills,
    _meta: {
      source: 'GITHUB',
      username,
      fetchedAt: new Date(),
    },
  };
}
