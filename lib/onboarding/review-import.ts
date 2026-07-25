/**
 * Helpers for importing projects / writing into onboarding review state.
 */

export type ReviewProjectInput = Record<string, unknown>;

export interface NormalizedReviewProject {
  id: string;
  title: string;
  description?: string;
  highlights: string[];
  technologies: string[];
  repoUrl?: string;
  liveUrl?: string;
  ghStars?: number;
  ghForks?: number;
  ghLanguage?: string;
  ghPinned?: boolean;
  ghTopics: string[];
  ghOwner?: string;
  ghRepo?: string;
  ghReadme?: string;
  ghLastPush?: string;
  ghLicense?: string;
  ghWatchers?: number;
  isVisible: boolean;
  showOnPortfolio: boolean;
  showOnResume: boolean;
  showStats: boolean;
  showReadme: boolean;
  source?: string;
}

export interface NormalizedReviewBlogPost {
  title: string;
  url: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  thumbnail?: string;
  author?: string;
  publishedAt?: string;
  tags: string[];
  readTimeMin?: number;
  claps?: number;
  platform?: string;
  platformIcon?: string;
  source?: string;
}

const LOW_QUALITY_PATTERNS = [
  /^test$/i,
  /^testing$/i,
  /^my-?first/i,
  /^hello-?world/i,
  /^learn/i,
  /^tutorial/i,
  /^practice/i,
  /^playground/i,
  /^experiment/i,
  /^sandbox/i,
  /^temp$/i,
  /^tmp$/i,
  /^scratch/i,
  /^demo$/i,
  /^example$/i,
  /^sample$/i,
  /^dotfiles$/i,
  /^config$/i,
  /^\.[a-z]+$/,
];

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function projectDedupeKey(project: {
  repoUrl?: string | null;
  ghOwner?: string | null;
  ghRepo?: string | null;
  title?: string | null;
}): string {
  const owner = (project.ghOwner || '').trim().toLowerCase();
  const repo = (project.ghRepo || '').trim().toLowerCase();
  if (owner && repo) return `gh:${owner}/${repo}`;

  const url = (project.repoUrl || '').trim().toLowerCase().replace(/\/+$/, '');
  if (url) return `url:${url}`;

  return `title:${(project.title || '').trim().toLowerCase()}`;
}

export function normalizeReviewProject(
  proj: ReviewProjectInput,
  options?: { id?: string; forceSource?: string }
): NormalizedReviewProject {
  const title = (proj.title as string) || (proj.name as string) || 'Untitled';
  const description = proj.description as string | undefined;
  const isPinned = (proj.ghPinned as boolean) || (proj.pinned as boolean) || false;
  const stars = (proj.ghStars as number) || (proj.stars as number) || 0;
  const forks = (proj.ghForks as number) || (proj.forks as number) || 0;
  const repoUrl = proj.repoUrl as string | undefined;

  const isFork = repoUrl?.includes('/fork/') || false;
  const isLowQuality =
    isFork ||
    LOW_QUALITY_PATTERNS.some((p) => p.test(title)) ||
    (!description && stars < 1 && !isPinned);
  const isHighQuality = isPinned || stars >= 5 || (!!description && description.length > 30);

  const fromGithub =
    options?.forceSource === 'GITHUB' ||
    (typeof repoUrl === 'string' && repoUrl.includes('github.com')) ||
    proj.source === 'GITHUB';

  const explicitTech = (proj.technologies as string[]) || [];
  const seededTech =
    explicitTech.length > 0
      ? explicitTech
      : [
          ...(proj.ghLanguage ? [String(proj.ghLanguage)] : []),
          ...(((proj.ghTopics as string[]) || []).filter(Boolean) as string[]),
        ].filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);

  return {
    id: options?.id || newId(),
    title,
    description,
    highlights: (proj.highlights as string[]) || [],
    technologies: seededTech,
    repoUrl,
    liveUrl: (proj.liveUrl as string | undefined) || (proj.url as string | undefined),
    ghStars: stars,
    ghForks: forks,
    ghLanguage: proj.ghLanguage as string | undefined,
    ghPinned: isPinned,
    ghTopics: (proj.ghTopics as string[]) || [],
    ghOwner: proj.ghOwner as string | undefined,
    ghRepo: proj.ghRepo as string | undefined,
    ghReadme: proj.ghReadme as string | undefined,
    ghLastPush: proj.ghLastPush as string | undefined,
    ghLicense: proj.ghLicense as string | undefined,
    ghWatchers: proj.ghWatchers as number | undefined,
    isVisible: !isLowQuality,
    showOnPortfolio: !isLowQuality,
    showOnResume: isHighQuality || stars >= 2,
    showStats: stars >= 3 || forks >= 2,
    showReadme: isPinned,
    source: options?.forceSource || (fromGithub ? 'GITHUB' : 'RESUME'),
  };
}

export function mergeImportedProjects<
  T extends {
    repoUrl?: string | null;
    ghOwner?: string | null;
    ghRepo?: string | null;
    title?: string | null;
  },
>(existing: T[], incoming: NormalizedReviewProject[]): Array<T | NormalizedReviewProject> {
  const seen = new Set(existing.map((p) => projectDedupeKey(p)));
  const merged: Array<T | NormalizedReviewProject> = [...existing];
  for (const project of incoming) {
    const key = projectDedupeKey(project);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(project);
  }
  return merged;
}

export function normalizeReviewBlogPost(post: ReviewProjectInput): NormalizedReviewBlogPost {
  return {
    title: (post.title as string) || 'Untitled',
    url: (post.url as string) || '',
    slug: post.slug as string | undefined,
    excerpt: post.excerpt as string | undefined,
    content: post.content as string | undefined,
    thumbnail: post.thumbnail as string | undefined,
    author: post.author as string | undefined,
    publishedAt: post.publishedAt as string | undefined,
    tags: (post.tags as string[]) || [],
    readTimeMin: post.readTimeMin as number | undefined,
    claps: post.claps as number | undefined,
    platform: (post.platform as string) || 'medium',
    platformIcon: post.platformIcon as string | undefined,
    source: (post.source as string) || 'MEDIUM',
  };
}

export function mergeImportedBlogPosts<T extends { url?: string | null }>(
  existing: T[],
  incoming: NormalizedReviewBlogPost[]
): Array<T | NormalizedReviewBlogPost> {
  const seen = new Set(
    existing.map((p) => (p.url || '').trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean)
  );
  const merged: Array<T | NormalizedReviewBlogPost> = [...existing];
  for (const post of incoming) {
    const key = (post.url || '').trim().toLowerCase().replace(/\/+$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(post);
  }
  return merged;
}
