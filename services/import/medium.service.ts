/**
 * Medium & Blog RSS Import Service
 *
 * Fetches blog posts from Medium (via RSS) and any other blog
 * platform that publishes an RSS or Atom feed.
 *
 * Legal basis:
 * - RSS feeds are explicitly published for public consumption
 * - No authentication or scraping required
 * - Medium, Substack, Dev.to, Hashnode, WordPress, Ghost all
 *   expose RSS feeds as a first-class feature
 *
 * Supported platforms:
 * - Medium:   https://medium.com/feed/@username
 * - Substack: https://example.substack.com/feed
 * - Dev.to:   https://dev.to/feed/username
 * - Hashnode: https://hashnode.com/@username/rss.xml  (or custom domain)
 * - WordPress: https://example.com/feed
 * - Ghost:    https://example.com/rss
 * - Any valid RSS/Atom feed URL
 */

import type {
  IMediumImportService,
  ImportServiceResult,
  NormalizedBlogPost,
  NormalizedImportResult,
  NormalizedLink,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('rss-parser');

// ─── Platform Detection ────────────────────────────────────────────

interface PlatformInfo {
  name: string;
  icon: string;
  feedUrl: (input: string) => string;
}

const PLATFORM_REGISTRY: Record<string, PlatformInfo> = {
  medium: {
    name: 'Medium',
    icon: 'medium',
    feedUrl: (username: string) => {
      const clean = username.replace(/^@/, '');
      return `https://medium.com/feed/@${clean}`;
    },
  },
  substack: {
    name: 'Substack',
    icon: 'substack',
    feedUrl: (input: string) => {
      // If already a URL, append /feed
      if (input.includes('substack.com')) {
        const base = input.replace(/\/+$/, '');
        return `${base}/feed`;
      }
      return `https://${input}.substack.com/feed`;
    },
  },
  devto: {
    name: 'Dev.to',
    icon: 'devto',
    feedUrl: (username: string) => `https://dev.to/feed/${username.replace(/^@/, '')}`,
  },
  hashnode: {
    name: 'Hashnode',
    icon: 'hashnode',
    feedUrl: (input: string) => {
      if (input.includes('.')) {
        // Custom domain
        return `https://${input.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/rss.xml`;
      }
      return `https://hashnode.com/@${input.replace(/^@/, '')}/rss.xml`;
    },
  },
};

/**
 * Detect platform from a feed URL
 */
function detectPlatform(url: string): { name: string; icon: string } {
  const lower = url.toLowerCase();
  if (lower.includes('medium.com')) return { name: 'Medium', icon: 'medium' };
  if (lower.includes('substack.com')) return { name: 'Substack', icon: 'substack' };
  if (lower.includes('dev.to')) return { name: 'Dev.to', icon: 'devto' };
  if (lower.includes('hashnode.com') || lower.includes('hashnode'))
    return { name: 'Hashnode', icon: 'hashnode' };
  if (lower.includes('wordpress.com') || lower.includes('/wp-content/'))
    return { name: 'WordPress', icon: 'wordpress' };
  if (lower.includes('ghost.io')) return { name: 'Ghost', icon: 'ghost' };
  if (lower.includes('blogger.com') || lower.includes('blogspot.com'))
    return { name: 'Blogger', icon: 'blogger' };
  return { name: 'Blog', icon: 'rss' };
}

/**
 * Extract a clean excerpt from HTML content
 */
function htmlToExcerpt(html: string, maxLength = 300): string {
  if (!html) return '';
  // Strip HTML tags
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

/**
 * Extract first image URL from HTML content (for thumbnail)
 */
function extractFirstImage(html: string): string | undefined {
  if (!html) return undefined;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

/**
 * Estimate reading time from HTML content
 */
function estimateReadTime(html: string): number {
  if (!html) return 1;
  const text = html.replace(/<[^>]*>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200)); // ~200 wpm average
}

/**
 * Extract tags/categories from RSS item
 */
function extractTags(item: Record<string, unknown>): string[] {
  const tags: string[] = [];

  // Standard RSS categories
  if (Array.isArray(item.categories)) {
    tags.push(...(item.categories as string[]));
  }

  // Some feeds use 'category' as singular
  if (typeof item.category === 'string') {
    tags.push(item.category);
  }

  return [
    ...new Set(
      tags.map((t: string) => (typeof t === 'string' ? t.trim() : String(t)).trim()).filter(Boolean)
    ),
  ];
}

// ─── Service Implementation ────────────────────────────────────────

export class MediumImportService implements IMediumImportService {
  private parser: InstanceType<typeof Parser>;

  constructor() {
    this.parser = new Parser({
      timeout: 15000,
      headers: {
        'User-Agent': 'Follio/1.0 (Portfolio Builder; RSS Reader)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'dcCreator'],
          ['media:content', 'mediaContent'],
          ['media:thumbnail', 'mediaThumbnail'],
        ],
      },
    });
  }

  /**
   * Import from a Medium username via RSS feed
   */
  async importFromMedium(username: string, userId: string): Promise<ImportServiceResult> {
    try {
      const clean = username.replace(/^@/, '').trim();
      if (!clean) {
        return { success: false, error: 'Username is required', errorCode: 'INVALID_INPUT' };
      }

      const feedUrl = PLATFORM_REGISTRY.medium.feedUrl(clean);
      return this.fetchAndNormalize(feedUrl, userId, 'medium');
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import from Medium',
        errorCode: 'MEDIUM_IMPORT_ERROR',
      };
    }
  }

  /**
   * Import from any RSS/Atom feed URL
   */
  async importFromRSS(
    feedUrl: string,
    userId: string,
    platform?: string
  ): Promise<ImportServiceResult> {
    try {
      // Validate URL
      let url: URL;
      try {
        url = new URL(feedUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return { success: false, error: 'URL must use http or https', errorCode: 'INVALID_URL' };
        }
      } catch {
        return { success: false, error: 'Invalid feed URL', errorCode: 'INVALID_URL' };
      }

      const detectedPlatform = platform || detectPlatform(url.href).name.toLowerCase();
      return this.fetchAndNormalize(url.href, userId, detectedPlatform);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import from RSS feed',
        errorCode: 'RSS_IMPORT_ERROR',
      };
    }
  }

  /**
   * Import from a known platform by name + identifier
   */
  async importFromPlatform(
    platformKey: string,
    identifier: string,
    userId: string
  ): Promise<ImportServiceResult> {
    const platform = PLATFORM_REGISTRY[platformKey.toLowerCase()];
    if (!platform) {
      return {
        success: false,
        error: `Unknown platform: ${platformKey}. Supported: ${Object.keys(PLATFORM_REGISTRY).join(', ')}`,
        errorCode: 'UNKNOWN_PLATFORM',
      };
    }

    const feedUrl = platform.feedUrl(identifier);
    return this.fetchAndNormalize(feedUrl, userId, platformKey.toLowerCase());
  }

  /**
   * Build the Medium profile link from username
   */
  static getMediumProfileUrl(username: string): string {
    const clean = username.replace(/^@/, '');
    return `https://medium.com/@${clean}`;
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private async fetchAndNormalize(
    feedUrl: string,
    _userId: string,
    platform: string
  ): Promise<ImportServiceResult> {
    // Fetch and parse RSS feed
    let feed: Record<string, unknown>;
    try {
      feed = await this.parser.parseURL(feedUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('404') || msg.includes('not found')) {
        return {
          success: false,
          error: 'Blog or feed not found. Check the username/URL and try again.',
          errorCode: 'FEED_NOT_FOUND',
        };
      }
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        return {
          success: false,
          error: 'Feed request timed out. Please try again later.',
          errorCode: 'FEED_TIMEOUT',
        };
      }
      return {
        success: false,
        error: `Could not parse RSS feed: ${msg}`,
        errorCode: 'FEED_PARSE_ERROR',
      };
    }

    const items = (feed.items as Record<string, unknown>[]) || [];
    if (items.length === 0) {
      return {
        success: false,
        error: 'No blog posts found in this feed.',
        errorCode: 'NO_POSTS_FOUND',
      };
    }

    const platformInfo = detectPlatform(feedUrl);

    // Normalize blog posts
    const blogPosts: NormalizedBlogPost[] = items.map((item, index) => {
      const contentHtml =
        (item.contentEncoded as string) ||
        (item.content as string) ||
        (item.summary as string) ||
        '';
      const thumbnail =
        extractFirstImage(contentHtml) ||
        (item.mediaThumbnail as Record<string, string>)?.url ||
        (item.mediaContent as Record<string, string>)?.url;

      return {
        title: (item.title as string) || 'Untitled',
        url: (item.link as string) || (item.guid as string) || '',
        slug: (item.link as string)
          ? new URL(item.link as string).pathname.split('/').pop() || undefined
          : undefined,
        excerpt: htmlToExcerpt(contentHtml),
        content: htmlToExcerpt(contentHtml, 500),
        thumbnail,
        author: (item.dcCreator as string) || (item.creator as string) || (feed.title as string),
        publishedAt: (item.isoDate as string) || (item.pubDate as string),
        tags: extractTags(item),
        readTimeMin: estimateReadTime(contentHtml),
        platform: platform || platformInfo.name.toLowerCase(),
        platformIcon: platformInfo.icon,
        source: 'BLOG' as const,
      };
    });

    // Create a link for the blog profile
    const links: NormalizedLink[] = [];
    const feedLink = (feed.link as string) || feedUrl;
    if (feedLink) {
      const linkType = platform === 'medium' ? 'MEDIUM' : 'BLOG';
      links.push({
        type: linkType,
        url: feedLink,
        label: `${platformInfo.name} Blog`,
        source: 'BLOG' as const,
      });
    }

    const result: NormalizedImportResult = {
      source: 'BLOG',
      profile: {
        // Some feeds include author bio info
        headline: (feed.description as string) || undefined,
      },
      links,
      blogPosts,
      experiences: [],
      projects: [],
      educations: [],
      skills: [],
      certifications: [],
      youtubeVideos: [],
      meta: {
        source: 'BLOG',
        importedAt: new Date(),
        rawDataStored: false,
        confidence: 0.85,
      },
      summary: {
        blogPosts: blogPosts.length,
        links: links.length,
        profileFields: 0,
        experiences: 0,
        projects: 0,
        educations: 0,
        skills: 0,
        certifications: 0,
        youtubeVideos: 0,
      },
    };

    return { success: true, data: result };
  }
}

// ─── Singleton ──────────────────────────────────────────────────

export const mediumImportService = new MediumImportService();
