/**
 * Enhanced GitHub Integration Service
 *
 * Provides comprehensive GitHub data fetching including:
 * - Pinned repositories (via GraphQL)
 * - README content for projects
 * - Organization memberships
 * - Language statistics (byte-based percentages)
 * - Contribution data
 *
 * Uses both REST API v3 and GraphQL API v4.
 */

import { logger } from '@/lib/logger';
import type { GitHubRepo, GitHubUser } from '@/types';

const githubLogger = logger.child({ source: 'github-enhanced' });

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';

// ===========================================
// TYPES
// ===========================================

// Re-export canonical types for backward compatibility
export type { GitHubRepo, GitHubUser };

export interface GitHubOrganization {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
  url: string;
  html_url?: string;
}

export interface GitHubReadme {
  content: string; // Base64 encoded
  encoding: string;
  size: number;
}

export interface GitHubLanguages {
  [language: string]: number; // bytes of code
}

export interface PinnedRepo {
  name: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  stargazerCount: number;
  forkCount: number;
  primaryLanguage: {
    name: string;
    color: string;
  } | null;
  repositoryTopics: {
    nodes: Array<{
      topic: {
        name: string;
      };
    }>;
  };
  pushedAt: string;
  licenseInfo: {
    key: string;
    name: string;
  } | null;
  owner: {
    login: string;
  };
}

export interface EnhancedGitHubData {
  user: GitHubUser;
  pinnedRepos: PinnedRepo[];
  repos: GitHubRepo[];
  organizations: GitHubOrganization[];
  languageStats: Record<string, number>; // Percentage per language
  totalStats: {
    totalStars: number;
    totalForks: number;
    publicRepos: number;
  };
  readmes: Record<string, string>; // repo full_name -> README content
}

export interface NormalizedEnhancedGitHubData {
  profile: {
    firstName?: string;
    lastName?: string;
    headline?: string;
    summary?: string;
    location?: string;
    avatarUrl?: string;
    company?: string;
    hireable?: boolean;
  };
  githubProfile: {
    username: string;
    githubId: number;
    avatarUrl: string;
    htmlUrl: string;
    bio: string | null;
    company: string | null;
    blog: string | null;
    location: string | null;
    hireable: boolean | null;
    publicRepos: number;
    publicGists: number;
    followers: number;
    following: number;
    accountCreatedAt: Date;
    totalStars: number;
    totalForks: number;
    primaryLanguages: string[];
    languageStats: Record<string, number>;
    organizations: Array<{
      login: string;
      avatarUrl: string;
      url: string;
      description?: string;
    }>;
  };
  contactInfo?: {
    email?: string;
  };
  links: Array<{
    type: string;
    url: string;
    label: string;
    source: 'GITHUB';
  }>;
  projects: Array<{
    title: string;
    description?: string;
    shortDesc?: string;
    url?: string;
    repoUrl: string;
    techStack: string[];
    featured: boolean;
    sortOrder: number;
    source: 'GITHUB';
    ghStars: number;
    ghForks: number;
    ghLanguage?: string;
    ghTopics: string[];
    ghOwner: string;
    ghRepo: string;
    ghReadme?: string;
    ghPinned: boolean;
    ghLastPush?: Date;
    ghLicense?: string;
    ghWatchers: number;
  }>;
  skills: Array<{
    name: string;
    category: string;
    sortOrder: number;
    source: 'GITHUB';
    percentage?: number; // For languages
  }>;
  // Summary for backward compatibility with existing UI
  summary: {
    profileFields: number;
    projects: number;
    skills: number;
    links: number;
    experiences: number;
    educations: number;
    certifications: number;
  };
  _meta: {
    source: 'GITHUB';
    username: string;
    fetchedAt: Date;
    hasPinnedRepos: boolean;
    hasOrganizations: boolean;
  };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function getHeaders(accessToken?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Follio-App/1.0',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

/**
 * Decode base64 README content
 */
function decodeReadme(content: string): string {
  try {
    // GitHub returns base64 with newlines, need to clean and decode
    const cleaned = content.replace(/\n/g, '');
    return Buffer.from(cleaned, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Extract first meaningful paragraph from README
 */
function extractReadmeDescription(readme: string, maxLength = 500): string {
  if (!readme) return '';

  // Remove badges (usually at the top)
  let content = readme.replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '');
  content = content.replace(/!\[.*?\]\(.*?\)/g, '');

  // Remove HTML tags
  content = content.replace(/<[^>]+>/g, '');

  // Split into paragraphs
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim());

  // Find first non-empty paragraph that's not a header
  for (const para of paragraphs) {
    // Skip headers
    if (para.startsWith('#')) continue;
    // Skip very short lines (likely headers without #)
    if (para.length < 50) continue;
    // Skip lines that are mostly special characters
    if ((para.match(/[a-zA-Z]/g)?.length || 0) < para.length * 0.5) continue;

    // Clean up markdown formatting
    let cleaned = para
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/`([^`]+)`/g, '$1') // Code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/\n/g, ' ')
      .trim();

    if (cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength - 3) + '...';
    }

    return cleaned;
  }

  return '';
}

/**
 * Calculate language percentages from byte counts
 */
function calculateLanguagePercentages(
  repoLanguages: Map<string, Record<string, number>>
): Record<string, number> {
  const totalByLanguage: Record<string, number> = {};

  for (const languages of repoLanguages.values()) {
    for (const [lang, bytes] of Object.entries(languages)) {
      totalByLanguage[lang] = (totalByLanguage[lang] || 0) + bytes;
    }
  }

  const total = Object.values(totalByLanguage).reduce((a, b) => a + b, 0);
  if (total === 0) return {};

  const percentages: Record<string, number> = {};
  for (const [lang, bytes] of Object.entries(totalByLanguage)) {
    percentages[lang] = Math.round((bytes / total) * 1000) / 10; // Round to 1 decimal
  }

  // Sort by percentage descending
  return Object.fromEntries(Object.entries(percentages).sort(([, a], [, b]) => b - a));
}

// ===========================================
// REST API FUNCTIONS
// ===========================================

/**
 * Fetch GitHub user profile
 */
export async function fetchGitHubUser(username: string, accessToken?: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API_BASE}/users/${username}`, {
    headers: getHeaders(accessToken),
  });

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
  options: { perPage?: number; includeForked?: boolean } = {}
): Promise<GitHubRepo[]> {
  const { perPage = 100, includeForked = false } = options;

  const params = new URLSearchParams({
    per_page: perPage.toString(),
    sort: 'pushed',
    direction: 'desc',
  });

  const response = await fetch(`${GITHUB_API_BASE}/users/${username}/repos?${params}`, {
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const repos: GitHubRepo[] = await response.json();

  // Filter based on options
  return repos.filter((repo) => {
    if (repo.archived) return false;
    if (!includeForked && repo.fork) return false;
    return true;
  });
}

/**
 * Fetch user's organizations
 */
export async function fetchGitHubOrganizations(
  username: string,
  accessToken?: string
): Promise<GitHubOrganization[]> {
  const response = await fetch(`${GITHUB_API_BASE}/users/${username}/orgs`, {
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    // Non-critical, return empty array
    githubLogger.warn('Failed to fetch organizations', { username, status: response.status });
    return [];
  }

  return response.json();
}

/**
 * Fetch repository languages (byte counts)
 */
export async function fetchRepoLanguages(
  fullName: string,
  accessToken?: string
): Promise<GitHubLanguages> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/languages`, {
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    return {};
  }

  return response.json();
}

/**
 * Fetch repository README
 */
export async function fetchRepoReadme(
  fullName: string,
  accessToken?: string
): Promise<string | null> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${fullName}/readme`, {
    headers: getHeaders(accessToken),
  });

  if (!response.ok) {
    return null;
  }

  const data: GitHubReadme = await response.json();
  return decodeReadme(data.content);
}

// ===========================================
// GRAPHQL API FUNCTIONS
// ===========================================

/**
 * Fetch pinned repositories using GraphQL
 */
export async function fetchPinnedRepos(
  username: string,
  accessToken?: string
): Promise<PinnedRepo[]> {
  // GraphQL requires authentication for user queries
  if (!accessToken) {
    githubLogger.debug('GraphQL API requires authentication, skipping pinned repos');
    return [];
  }

  const query = `
    query($username: String!) {
      user(login: $username) {
        pinnedItems(first: 6, types: [REPOSITORY]) {
          nodes {
            ... on Repository {
              name
              description
              url
              homepageUrl
              stargazerCount
              forkCount
              primaryLanguage {
                name
                color
              }
              repositoryTopics(first: 10) {
                nodes {
                  topic {
                    name
                  }
                }
              }
              pushedAt
              licenseInfo {
                key
                name
              }
              owner {
                login
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(GITHUB_GRAPHQL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Follio-App/1.0',
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
    });

    if (!response.ok) {
      githubLogger.warn('GraphQL API error', { status: response.status });
      return [];
    }

    const data = await response.json();

    if (data.errors) {
      githubLogger.warn('GraphQL response contained errors', { errorCount: data.errors.length });
      return [];
    }

    return data.data?.user?.pinnedItems?.nodes || [];
  } catch (error) {
    githubLogger.error('Error fetching pinned repos', error);
    return [];
  }
}

// ===========================================
// MAIN FETCH FUNCTION
// ===========================================

/**
 * Fetch comprehensive GitHub data for a user
 */
export async function fetchEnhancedGitHubData(
  username: string,
  accessToken?: string,
  options: {
    fetchReadmes?: boolean;
    maxRepos?: number;
    maxReadmes?: number;
  } = {}
): Promise<EnhancedGitHubData> {
  const { fetchReadmes = true, maxRepos = 50, maxReadmes = 10 } = options;

  // Fetch user, repos, and orgs in parallel
  const [user, repos, organizations, pinnedRepos] = await Promise.all([
    fetchGitHubUser(username, accessToken),
    fetchGitHubRepos(username, accessToken, { perPage: maxRepos }),
    fetchGitHubOrganizations(username, accessToken),
    fetchPinnedRepos(username, accessToken),
  ]);

  // Calculate stats
  let totalStars = 0;
  let totalForks = 0;

  for (const repo of repos) {
    totalStars += repo.stargazers_count;
    totalForks += repo.forks_count;
  }

  // Fetch language stats for top repos
  const languagePromises = repos
    .slice(0, 20) // Top 20 repos for language analysis
    .map(async (repo) => {
      const languages = await fetchRepoLanguages(repo.full_name, accessToken);
      return { fullName: repo.full_name, languages };
    });

  const languageResults = await Promise.all(languagePromises);
  const repoLanguages = new Map<string, Record<string, number>>();
  for (const { fullName, languages } of languageResults) {
    repoLanguages.set(fullName, languages);
  }

  const languageStats = calculateLanguagePercentages(repoLanguages);

  // Fetch READMEs for featured repos
  const readmes: Record<string, string> = {};

  if (fetchReadmes) {
    // Prioritize pinned repos, then top starred
    const pinnedNames = new Set(pinnedRepos.map((r) => r.name));
    const reposForReadmes = [
      ...repos.filter((r) => pinnedNames.has(r.name)),
      ...repos
        .filter((r) => !pinnedNames.has(r.name))
        .sort((a, b) => b.stargazers_count - a.stargazers_count),
    ].slice(0, maxReadmes);

    const readmePromises = reposForReadmes.map(async (repo) => {
      const readme = await fetchRepoReadme(repo.full_name, accessToken);
      return { fullName: repo.full_name, readme };
    });

    const readmeResults = await Promise.all(readmePromises);
    for (const { fullName, readme } of readmeResults) {
      if (readme) {
        readmes[fullName] = readme;
      }
    }
  }

  return {
    user,
    pinnedRepos,
    repos,
    organizations,
    languageStats,
    totalStats: {
      totalStars,
      totalForks,
      publicRepos: user.public_repos,
    },
    readmes,
  };
}

// ===========================================
// NORMALIZATION
// ===========================================

/**
 * Normalize enhanced GitHub data to profile format
 */
export function normalizeEnhancedGitHubData(
  data: EnhancedGitHubData
): NormalizedEnhancedGitHubData {
  const { user, pinnedRepos, repos, organizations, languageStats, totalStats, readmes } = data;

  // Parse name
  const nameParts = user.name?.split(' ') || [];
  const firstName = nameParts[0] || user.login;
  const lastName = nameParts.slice(1).join(' ') || undefined;

  // Get top languages
  const primaryLanguages = Object.keys(languageStats).slice(0, 5);

  // Create pinned repo name set for quick lookup
  const pinnedRepoNames = new Set(pinnedRepos.map((r) => r.name));

  // Create links
  const links: NormalizedEnhancedGitHubData['links'] = [
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

  // Combine pinned repos and top repos, avoiding duplicates
  const processedRepoNames = new Set<string>();
  const projects: NormalizedEnhancedGitHubData['projects'] = [];

  // First, add pinned repos (they're featured)
  for (const pinnedRepo of pinnedRepos) {
    const fullName = `${pinnedRepo.owner.login}/${pinnedRepo.name}`;
    const readme = readmes[fullName];
    const readmeDescription = readme ? extractReadmeDescription(readme) : undefined;

    projects.push({
      title: pinnedRepo.name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      description: readmeDescription || pinnedRepo.description || undefined,
      shortDesc: pinnedRepo.description?.slice(0, 100) || undefined,
      url: pinnedRepo.homepageUrl || undefined,
      repoUrl: pinnedRepo.url,
      techStack: [
        pinnedRepo.primaryLanguage?.name,
        ...pinnedRepo.repositoryTopics.nodes.map((t) => t.topic.name),
      ].filter(Boolean) as string[],
      featured: true,
      sortOrder: projects.length,
      source: 'GITHUB',
      ghStars: pinnedRepo.stargazerCount,
      ghForks: pinnedRepo.forkCount,
      ghLanguage: pinnedRepo.primaryLanguage?.name,
      ghTopics: pinnedRepo.repositoryTopics.nodes.map((t) => t.topic.name),
      ghOwner: pinnedRepo.owner.login,
      ghRepo: pinnedRepo.name,
      ghReadme: readmeDescription,
      ghPinned: true,
      ghLastPush: pinnedRepo.pushedAt ? new Date(pinnedRepo.pushedAt) : undefined,
      ghLicense: pinnedRepo.licenseInfo?.name,
      ghWatchers: 0, // Not available in GraphQL pinned query
    });

    processedRepoNames.add(pinnedRepo.name);
  }

  // Then add non-pinned repos sorted by stars
  const sortedRepos = repos
    .filter((r) => !processedRepoNames.has(r.name))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 10 - projects.length);

  for (const repo of sortedRepos) {
    const readme = readmes[repo.full_name];
    const readmeDescription = readme ? extractReadmeDescription(readme) : undefined;

    projects.push({
      title: repo.name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      description: readmeDescription || repo.description || undefined,
      shortDesc: repo.description?.slice(0, 100) || undefined,
      url: repo.homepage || undefined,
      repoUrl: repo.html_url,
      techStack: [repo.language, ...repo.topics].filter(Boolean) as string[],
      featured:
        pinnedRepoNames.has(repo.name) || (projects.length < 3 && repo.stargazers_count > 0),
      sortOrder: projects.length,
      source: 'GITHUB',
      ghStars: repo.stargazers_count,
      ghForks: repo.forks_count,
      ghLanguage: repo.language || undefined,
      ghTopics: repo.topics,
      ghOwner: repo.owner.login,
      ghRepo: repo.name,
      ghReadme: readmeDescription,
      ghPinned: false,
      ghLastPush: repo.pushed_at ? new Date(repo.pushed_at) : undefined,
      ghLicense: repo.license?.name,
      ghWatchers: repo.watchers_count,
    });
  }

  // Create skills from languages (with percentages) and topics
  const skills: NormalizedEnhancedGitHubData['skills'] = [];

  // Add languages with percentages
  Object.entries(languageStats)
    .slice(0, 10)
    .forEach(([lang, percentage], index) => {
      skills.push({
        name: lang,
        category: 'Languages',
        sortOrder: index,
        source: 'GITHUB',
        percentage,
      });
    });

  // Extract unique topics from all repos
  const topicCounts: Record<string, number> = {};
  for (const repo of repos) {
    for (const topic of repo.topics) {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
  }

  // Add top topics as skills
  Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .forEach(([topic]) => {
      // Avoid duplicates with languages
      if (!languageStats[topic] && !languageStats[topic.toLowerCase()]) {
        skills.push({
          name: topic,
          category: 'Technologies',
          sortOrder: skills.length,
          source: 'GITHUB',
        });
      }
    });

  return {
    profile: {
      firstName,
      lastName,
      headline: user.bio || `${firstName} on GitHub`,
      summary: user.bio || undefined,
      location: user.location || undefined,
      avatarUrl: user.avatar_url,
      company: user.company || undefined,
      hireable: user.hireable || undefined,
    },
    githubProfile: {
      username: user.login,
      githubId: user.id,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      bio: user.bio,
      company: user.company,
      blog: user.blog,
      location: user.location,
      hireable: user.hireable,
      publicRepos: user.public_repos,
      publicGists: user.public_gists,
      followers: user.followers,
      following: user.following,
      accountCreatedAt: new Date(user.created_at),
      totalStars: totalStats.totalStars,
      totalForks: totalStats.totalForks,
      primaryLanguages,
      languageStats,
      organizations: organizations.map((org) => ({
        login: org.login,
        avatarUrl: org.avatar_url,
        url: org.html_url || org.url,
        description: org.description || undefined,
      })),
    },
    contactInfo: user.email ? { email: user.email } : undefined,
    links,
    projects,
    skills,
    summary: {
      profileFields: Object.values({
        firstName,
        lastName,
        headline: user.bio,
        location: user.location,
        avatarUrl: user.avatar_url,
      }).filter(Boolean).length,
      projects: projects.length,
      skills: skills.length,
      links: links.length,
      experiences: 0,
      educations: 0,
      certifications: 0,
    },
    _meta: {
      source: 'GITHUB',
      username: user.login,
      fetchedAt: new Date(),
      hasPinnedRepos: pinnedRepos.length > 0,
      hasOrganizations: organizations.length > 0,
    },
  };
}

/**
 * Main function to fetch and normalize enhanced GitHub data
 */
export async function getEnhancedGitHubData(
  username: string,
  accessToken?: string
): Promise<NormalizedEnhancedGitHubData> {
  const data = await fetchEnhancedGitHubData(username, accessToken);
  return normalizeEnhancedGitHubData(data);
}
