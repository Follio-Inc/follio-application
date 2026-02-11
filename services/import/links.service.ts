/**
 * Links Import Service
 *
 * Service for validating and normalizing manually added links.
 * Auto-detects link types from URLs.
 */

import type {
  ILinksImportService,
  ImportServiceResult,
  NormalizedImportResult,
  NormalizedLink,
} from './types';

// URL patterns for auto-detection
const LINK_PATTERNS: Record<string, RegExp> = {
  GITHUB: /^https?:\/\/(www\.)?github\.com\//i,
  LINKEDIN: /^https?:\/\/(www\.)?linkedin\.com\//i,
  TWITTER: /^https?:\/\/(www\.)?(twitter|x)\.com\//i,
  DRIBBBLE: /^https?:\/\/(www\.)?dribbble\.com\//i,
  BEHANCE: /^https?:\/\/(www\.)?behance\.net\//i,
  YOUTUBE: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i,
  MEDIUM: /^https?:\/\/(www\.)?medium\.com\//i,
  SUBSTACK: /^https?:\/\/[\w-]+\.substack\.com/i,
  HASHNODE: /^https?:\/\/(www\.)?hashnode\.com\//i,
  DEVTO: /^https?:\/\/(www\.)?dev\.to\//i,
  NOTION: /^https?:\/\/(www\.)?notion\.(so|site)\//i,
  FIGMA: /^https?:\/\/(www\.)?figma\.com\//i,
  CODEPEN: /^https?:\/\/(www\.)?codepen\.io\//i,
  STACKOVERFLOW: /^https?:\/\/(www\.)?stackoverflow\.com\//i,
  BLOG: /\/(blog|posts?|articles?)\//i,
  PORTFOLIO: /\/(portfolio|projects?|work)\//i,
};

// Default labels for detected types
const TYPE_LABELS: Record<string, string> = {
  GITHUB: 'GitHub',
  LINKEDIN: 'LinkedIn',
  TWITTER: 'Twitter/X',
  DRIBBBLE: 'Dribbble',
  BEHANCE: 'Behance',
  YOUTUBE: 'YouTube',
  MEDIUM: 'Medium',
  SUBSTACK: 'Substack',
  HASHNODE: 'Hashnode',
  DEVTO: 'Dev.to',
  NOTION: 'Notion',
  FIGMA: 'Figma',
  CODEPEN: 'CodePen',
  STACKOVERFLOW: 'Stack Overflow',
  BLOG: 'Blog',
  PORTFOLIO: 'Portfolio',
  OTHER: 'Website',
};

/**
 * Validate URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize URL (ensure https, clean up)
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();

  // Add protocol if missing
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = `https://${normalized}`;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

/**
 * Links Import Service Implementation
 */
export class LinksImportService implements ILinksImportService {
  /**
   * Auto-detect link type from URL
   */
  detectLinkType(url: string): string {
    const normalizedUrl = normalizeUrl(url);

    for (const [type, pattern] of Object.entries(LINK_PATTERNS)) {
      if (pattern.test(normalizedUrl)) {
        return type;
      }
    }

    return 'OTHER';
  }

  /**
   * Validate and normalize manually added links
   */
  async importLinks(
    links: Array<{ url: string; label?: string }>,
    _userId: string
  ): Promise<ImportServiceResult> {
    try {
      if (!links || links.length === 0) {
        return {
          success: false,
          error: 'No links provided',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const normalizedLinks: NormalizedLink[] = [];
      const errors: string[] = [];

      for (const link of links) {
        const url = normalizeUrl(link.url);

        if (!isValidUrl(url)) {
          errors.push(`Invalid URL: ${link.url}`);
          continue;
        }

        const type = this.detectLinkType(url);
        const label = link.label?.trim() || TYPE_LABELS[type] || 'Website';

        // Check for duplicates
        if (normalizedLinks.some((l) => l.url.toLowerCase() === url.toLowerCase())) {
          continue;
        }

        normalizedLinks.push({
          type,
          url,
          label,
          source: 'MANUAL',
        });
      }

      if (normalizedLinks.length === 0) {
        return {
          success: false,
          error: errors.length > 0 ? errors.join('; ') : 'No valid links found',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      const result: NormalizedImportResult = {
        source: 'MANUAL',
        links: normalizedLinks,
        meta: {
          source: 'MANUAL',
          importedAt: new Date(),
          confidence: 1.0,
        },
        summary: {
          links: normalizedLinks.length,
        },
      };

      // Include any errors as warnings
      if (errors.length > 0) {
        (result.meta as Record<string, unknown>).warnings = errors;
      }

      return {
        success: true,
        data: result,
        status: 'completed',
      };
    } catch (error) {
      console.error('Links import error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process links',
        errorCode: 'IMPORT_ERROR',
      };
    }
  }
}

// Export singleton instance
export const linksImportService = new LinksImportService();
