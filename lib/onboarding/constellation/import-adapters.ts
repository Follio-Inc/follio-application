/**
 * Production constellation imports — call authenticated /api/import/* routes
 * and normalize identity + payload for onboarding finalize.
 */

import { extractGitHubUsername, extractLinkedInSlug } from '@/lib/import/profile-url';
import {
  previewPlatformIdentity,
  type PlatformDef,
  type PlatformId,
  type PreviewIdentity,
} from '@/lib/onboarding/constellation/platforms';

export type ConstellationLink = {
  url: string;
  type: string;
  label: string;
};

export type ConstellationImportBundle = {
  identity: PreviewIdentity;
  /** Key under importedData (github, linkedin, medium, youtube, substack) */
  dataKey?: 'github' | 'linkedin' | 'medium' | 'youtube' | 'substack';
  data?: Record<string, unknown>;
  /** Always attach at least a profile/site link when we have a URL */
  link?: ConstellationLink;
};

const LINK_TYPE_BY_PLATFORM: Partial<Record<PlatformId, string>> = {
  linkedin: 'LINKEDIN',
  github: 'GITHUB',
  portfolio: 'PORTFOLIO',
  medium: 'MEDIUM',
  substack: 'SUBSTACK',
  youtube: 'YOUTUBE',
  dribbble: 'DRIBBBLE',
  behance: 'BEHANCE',
};

function ensureHttpUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '');
  if (trimmed.includes('.') || trimmed.includes('/')) {
    return `https://${trimmed.replace(/\/+$/, '')}`;
  }
  return trimmed;
}

function linkForPlatform(
  platform: PlatformDef,
  identity: PreviewIdentity
): ConstellationLink | undefined {
  const url = identity.sourceUrl || ensureHttpUrl(identity.handle);
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  return {
    url: url.replace(/\/+$/, ''),
    type: LINK_TYPE_BY_PLATFORM[platform.id] || 'OTHER',
    label: platform.label,
  };
}

export function identityFromGithubData(
  data: Record<string, unknown>,
  username: string
): PreviewIdentity {
  const profile = (data.profile as Record<string, unknown>) || {};
  const gh = (data.githubProfile as Record<string, unknown>) || {};
  const handle = (gh.username as string) || username;
  const essentials = [
    typeof gh.publicRepos === 'number' ? `${gh.publicRepos} repos` : null,
    typeof gh.followers === 'number' ? `${gh.followers} followers` : null,
    (gh.location as string) || null,
    (gh.company as string) || null,
  ].filter(Boolean) as string[];

  return {
    displayName: (profile.firstName as string)
      ? [profile.firstName, profile.lastName].filter(Boolean).join(' ')
      : (gh.username as string) || `@${handle}`,
    handle: `@${handle}`,
    avatarUrl: (profile.avatarUrl as string) || (gh.avatarUrl as string) || null,
    secondary: (profile.summary as string) || (gh.bio as string) || null,
    essentials,
    sourceUrl: (gh.htmlUrl as string) || `https://github.com/${handle}`,
  };
}

export function identityFromLinkedInData(
  data: Record<string, unknown>,
  slug = 'profile'
): PreviewIdentity {
  const profile = (data.profile as Record<string, unknown>) || {};
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  const links = (data.links as Array<Record<string, unknown>>) || [];
  const linkedInUrl =
    (links.find((l) => String(l.type).toUpperCase() === 'LINKEDIN')?.url as string) ||
    (slug !== 'profile' ? `https://www.linkedin.com/in/${slug}` : undefined);

  return {
    displayName: name || slug,
    handle: linkedInUrl
      ? linkedInUrl.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')
      : 'LinkedIn',
    avatarUrl: (profile.avatarUrl as string) || null,
    secondary: (profile.headline as string) || 'LinkedIn profile imported',
    essentials: ['Headline & experience', 'Education', 'Skills'].filter(Boolean),
    sourceUrl: linkedInUrl,
  };
}

async function importGithub(input: string): Promise<ConstellationImportBundle> {
  const username = extractGitHubUsername(input);
  if (!username) throw new Error('Enter a GitHub username or profile URL');

  const response = await fetch('/api/import/github', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import GitHub');

  const data = payload.data as Record<string, unknown>;
  const identity = identityFromGithubData(data, username);
  return {
    identity,
    dataKey: 'github',
    data,
    link: linkForPlatform({ id: 'github', label: 'GitHub' } as PlatformDef, identity),
  };
}

async function importLinkedIn(input: string): Promise<ConstellationImportBundle> {
  const slug = extractLinkedInSlug(input);
  if (!slug) throw new Error('Paste a LinkedIn profile URL');

  const response = await fetch('/api/import/linkedin/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: input.trim() }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import LinkedIn');

  const data = payload.data as Record<string, unknown>;
  const identity = identityFromLinkedInData(data, slug);
  return {
    identity,
    dataKey: 'linkedin',
    data,
    link: linkForPlatform({ id: 'linkedin', label: 'LinkedIn' } as PlatformDef, identity),
  };
}

/** Import via Clerk-connected GitHub account (username from OAuth). */
export async function importGithubOAuth(username: string): Promise<ConstellationImportBundle> {
  return importGithub(username);
}

/** Import via Clerk-connected LinkedIn OIDC account. */
export async function importLinkedInOAuth(): Promise<ConstellationImportBundle> {
  const response = await fetch('/api/import/linkedin/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import LinkedIn');

  const data = payload.data as Record<string, unknown>;
  const identity = identityFromLinkedInData(data);
  return {
    identity,
    dataKey: 'linkedin',
    data,
    link: linkForPlatform({ id: 'linkedin', label: 'LinkedIn' } as PlatformDef, identity),
  };
}

/**
 * OAuth import for constellation GitHub / LinkedIn tiles.
 * Requires a connected Clerk external account (GitHub username for GH).
 */
export async function importConstellationOAuth(
  platform: PlatformDef,
  options?: { githubUsername?: string | null }
): Promise<ConstellationImportBundle> {
  if (platform.id === 'github') {
    const username = options?.githubUsername?.trim();
    if (!username) throw new Error('Connect GitHub first, then import');
    return importGithubOAuth(username);
  }
  if (platform.id === 'linkedin') {
    return importLinkedInOAuth();
  }
  throw new Error(`${platform.label} does not support OAuth import`);
}

async function importMedium(
  platform: PlatformDef,
  input: string
): Promise<ConstellationImportBundle> {
  const response = await fetch('/api/import/medium', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: input.trim() }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import Medium');

  const data = payload.data as Record<string, unknown>;
  const identity = await previewPlatformIdentity(platform, input);
  const posts = (data.blogPosts as unknown[]) || [];
  identity.essentials = [`${posts.length} stories`, 'About', 'Publications'];
  identity.secondary = payload.message || 'Writing profile imported';

  return {
    identity,
    dataKey: 'medium',
    data,
    link: linkForPlatform(platform, identity),
  };
}

async function importSubstack(
  platform: PlatformDef,
  input: string
): Promise<ConstellationImportBundle> {
  const response = await fetch('/api/import/medium', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'substack', identifier: input.trim() }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import Substack');

  const data = payload.data as Record<string, unknown>;
  const identity = await previewPlatformIdentity(platform, input);
  const posts = (data.blogPosts as unknown[]) || [];
  identity.essentials = [`${posts.length} posts`, 'About', 'Subscribe'];
  identity.secondary = payload.message || 'Publication imported';

  return {
    identity,
    dataKey: 'substack',
    data,
    link: linkForPlatform(platform, identity),
  };
}

async function importYouTube(
  platform: PlatformDef,
  input: string
): Promise<ConstellationImportBundle> {
  const response = await fetch('/api/import/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: input.trim() }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Failed to import YouTube');

  const data = payload.data as Record<string, unknown>;
  const videos = (data.youtubeVideos as Array<Record<string, unknown>>) || [];
  const links = (data.links as Array<Record<string, unknown>>) || [];
  const channelTitle =
    (videos[0]?.channelTitle as string) || (links[0]?.label as string) || input.trim();
  const channelUrl = (links[0]?.url as string) || undefined;

  const identity: PreviewIdentity = {
    displayName: channelTitle,
    handle: channelUrl || input.trim(),
    avatarUrl: (videos[0]?.thumbnail as string) || null,
    secondary: payload.message || 'Channel imported',
    essentials: [
      `${videos.length} videos`,
      videos[0]?.channelTitle ? String(videos[0].channelTitle) : null,
    ].filter(Boolean) as string[],
    sourceUrl: channelUrl,
  };

  return {
    identity,
    dataKey: 'youtube',
    data,
    link: channelUrl
      ? { url: channelUrl, type: 'YOUTUBE', label: platform.label }
      : linkForPlatform(platform, identity),
  };
}

/** Link-only platforms (no dedicated import API yet). */
async function importAsLink(
  platform: PlatformDef,
  input: string
): Promise<ConstellationImportBundle> {
  const identity = await previewPlatformIdentity(platform, input);
  const link = linkForPlatform(platform, identity);
  if (!link) throw new Error(`Could not resolve a URL for ${platform.label}`);
  return { identity, link };
}

/**
 * Run the appropriate production import for a constellation platform.
 * Rich sources hit /api/import/*; others persist as profile links on finalize.
 */
export async function importConstellationPlatform(
  platform: PlatformDef,
  input: string
): Promise<ConstellationImportBundle> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Add a username or link first');

  switch (platform.id) {
    case 'github':
      return importGithub(trimmed);
    case 'linkedin':
      return importLinkedIn(trimmed);
    case 'medium':
      return importMedium(platform, trimmed);
    case 'substack':
      return importSubstack(platform, trimmed);
    case 'youtube':
      return importYouTube(platform, trimmed);
    default:
      return importAsLink(platform, trimmed);
  }
}
