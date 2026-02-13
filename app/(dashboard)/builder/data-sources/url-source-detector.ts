/**
 * URL Source Detector
 *
 * Takes a raw URL pasted by the user, detects the platform,
 * extracts the identifier (username/channel/etc.), and returns
 * the matching source definition + fetcher info.
 *
 * Known platforms get specific fetchers (Medium → RSS, YouTube → API).
 * Unknown URLs fall back to a generic RSS probe.
 */

import type { SourceDefinition } from './source-types';

// ─── Detection Result ────────────────────────────────────────────

export interface DetectedSource {
  /** Matched platform key (e.g. 'medium', 'youtube') or 'custom-link' */
  key: string;
  /** Human label */
  label: string;
  /** Extracted identifier (username, channel, etc.) */
  identifier: string;
  /** The original URL the user pasted */
  url: string;
  /** Which API endpoint to call for fetching */
  fetchEndpoint: string;
  /** Body to send to the fetch endpoint */
  fetchBody: Record<string, unknown>;
  /** Source definition for the tab */
  source: SourceDefinition;
}

// ─── URL Pattern → Platform Mapping ─────────────────────────────

interface PlatformPattern {
  key: string;
  label: string;
  /** Regex that matches the URL. Capture group 1 = identifier. */
  pattern: RegExp;
  /** Build fetch endpoint + body from the identifier */
  buildFetch: (
    identifier: string,
    url: string
  ) => { endpoint: string; body: Record<string, unknown> };
  /** Source definition overrides */
  source: Omit<SourceDefinition, 'key' | 'label'>;
}

const PLATFORM_PATTERNS: PlatformPattern[] = [
  // ─── Medium ──────────────────────────────────────
  {
    key: 'medium',
    label: 'Medium',
    pattern: /^https?:\/\/(www\.)?medium\.com\/@?([\w.-]+)/i,
    buildFetch: (identifier) => ({
      endpoint: '/api/import/medium',
      body: { username: identifier, saveToProfile: true },
    }),
    source: {
      description: 'Blog posts from Medium',
      icon: 'BookOpen',
      colorClass: 'from-gray-500/10 to-neutral-500/10 ring-gray-500/20',
      iconColorClass: 'text-gray-700 dark:text-gray-300',
      requiresOAuth: false,
      dataSource: 'BLOG',
      builtIn: false,
      userAddable: true,
    },
  },

  // ─── Dev.to ──────────────────────────────────────
  {
    key: 'devto',
    label: 'Dev.to',
    pattern: /^https?:\/\/(www\.)?dev\.to\/([\w.-]+)/i,
    buildFetch: (identifier) => ({
      endpoint: '/api/import/medium',
      body: { platform: 'devto', identifier, saveToProfile: true },
    }),
    source: {
      description: 'Blog posts from Dev.to',
      icon: 'BookOpen',
      colorClass: 'from-gray-800/10 to-gray-600/10 ring-gray-700/20',
      iconColorClass: 'text-gray-800 dark:text-gray-200',
      requiresOAuth: false,
      dataSource: 'BLOG',
      builtIn: false,
      userAddable: true,
    },
  },

  // ─── Substack ────────────────────────────────────
  {
    key: 'substack',
    label: 'Substack',
    pattern: /^https?:\/\/([\w.-]+)\.substack\.com/i,
    buildFetch: (identifier) => ({
      endpoint: '/api/import/medium',
      body: { platform: 'substack', identifier, saveToProfile: true },
    }),
    source: {
      description: 'Newsletter posts from Substack',
      icon: 'BookOpen',
      colorClass: 'from-orange-500/10 to-orange-400/10 ring-orange-500/20',
      iconColorClass: 'text-orange-500',
      requiresOAuth: false,
      dataSource: 'BLOG',
      builtIn: false,
      userAddable: true,
    },
  },

  // ─── Hashnode ────────────────────────────────────
  {
    key: 'hashnode',
    label: 'Hashnode',
    pattern: /^https?:\/\/(www\.)?hashnode\.com\/@?([\w.-]+)/i,
    buildFetch: (identifier) => ({
      endpoint: '/api/import/medium',
      body: { platform: 'hashnode', identifier, saveToProfile: true },
    }),
    source: {
      description: 'Blog posts from Hashnode',
      icon: 'BookOpen',
      colorClass: 'from-blue-600/10 to-blue-500/10 ring-blue-600/20',
      iconColorClass: 'text-blue-600',
      requiresOAuth: false,
      dataSource: 'BLOG',
      builtIn: false,
      userAddable: true,
    },
  },

  // ─── YouTube ─────────────────────────────────────
  {
    key: 'youtube',
    label: 'YouTube',
    pattern:
      /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/([@\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i,
    buildFetch: (_identifier, url) => ({
      endpoint: '/api/import/youtube',
      body: { channel: url, saveToProfile: true },
    }),
    source: {
      description: 'Videos from YouTube',
      icon: 'Youtube',
      colorClass: 'from-red-500/10 to-red-600/10 ring-red-500/20',
      iconColorClass: 'text-red-500',
      requiresOAuth: false,
      dataSource: 'YOUTUBE',
      builtIn: false,
      userAddable: true,
    },
  },
];

// ─── Detect Function ─────────────────────────────────────────────

/**
 * Detect the platform from a URL, extract identifier, and return
 * everything needed to create a tab and fetch data.
 */
export function detectSourceFromUrl(url: string): DetectedSource | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Ensure it looks like a URL
  let normalizedUrl = trimmed;
  if (!normalizedUrl.match(/^https?:\/\//i)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  for (const platform of PLATFORM_PATTERNS) {
    const match = normalizedUrl.match(platform.pattern);
    if (match) {
      // The identifier is the last capture group (could be group 2 or 3)
      const identifier = match[match.length - 1] || match[1];
      const { endpoint, body } = platform.buildFetch(identifier, normalizedUrl);

      return {
        key: platform.key,
        label: platform.label,
        identifier,
        url: normalizedUrl,
        fetchEndpoint: endpoint,
        fetchBody: body,
        source: {
          key: platform.key,
          label: platform.label,
          ...platform.source,
        },
      };
    }
  }

  // No known platform matched — return null.
  // The dialog will show an "unsupported" message.
  return null;
}

/**
 * Get list of supported platform examples for the dialog hint text.
 */
export function getSupportedPlatforms(): { key: string; label: string; example: string }[] {
  return [
    { key: 'medium', label: 'Medium', example: 'medium.com/@username' },
    { key: 'devto', label: 'Dev.to', example: 'dev.to/username' },
    { key: 'substack', label: 'Substack', example: 'name.substack.com' },
    { key: 'hashnode', label: 'Hashnode', example: 'hashnode.com/@username' },
    { key: 'youtube', label: 'YouTube', example: 'youtube.com/@channel' },
  ];
}
