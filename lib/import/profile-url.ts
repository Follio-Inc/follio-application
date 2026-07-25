/**
 * Normalize GitHub / LinkedIn profile inputs (full URL or bare username/slug)
 * into identifiers and canonical profile URLs.
 */

const GITHUB_USERNAME_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
/** LinkedIn vanity names: letters, digits, hyphens; typically 3–100 chars. */
const LINKEDIN_SLUG_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,98}[a-zA-Z0-9])?$/;

function tryParseAsUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Extract a GitHub username from a profile URL, `@user`, or bare username. */
export function extractGitHubUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const url = tryParseAsUrl(trimmed);
  if (url?.hostname.includes('github.com')) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[0].replace(/^@/, '');
    }
  }

  return (
    trimmed
      .replace(/^@/, '')
      .replace(/^github\.com\//i, '')
      .split('/')[0] ?? ''
  );
}

/** True when the string is a valid GitHub username. */
export function isValidGitHubUsername(username: string): boolean {
  return GITHUB_USERNAME_RE.test(username);
}

/** Canonical public GitHub profile URL for a username. */
export function buildGitHubProfileUrl(username: string): string {
  return `https://github.com/${username}`;
}

/**
 * Extract a LinkedIn vanity slug from:
 * - https://www.linkedin.com/in/jane-doe
 * - linkedin.com/in/jane-doe/
 * - https://linkedin.com/pub/jane-doe/...
 * - jane-doe (bare username)
 */
export function extractLinkedInSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const url = tryParseAsUrl(trimmed);
  if (url?.hostname.includes('linkedin.com')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const inIdx = parts.findIndex((p) => p === 'in' || p === 'pub');
    if (inIdx >= 0 && parts[inIdx + 1]) {
      return decodeURIComponent(parts[inIdx + 1]).replace(/\/+$/, '');
    }
  }

  return (
    trimmed
      .replace(/^@/, '')
      .replace(/^linkedin\.com\/in\//i, '')
      .replace(/^www\.linkedin\.com\/in\//i, '')
      .split('/')[0]
      ?.replace(/\/+$/, '') ?? ''
  );
}

/** True when the string looks like a valid LinkedIn vanity name. */
export function isValidLinkedInSlug(slug: string): boolean {
  return LINKEDIN_SLUG_RE.test(slug) && slug.length >= 3 && slug.length <= 100;
}

/** Canonical public LinkedIn profile URL for a vanity slug. */
export function buildLinkedInProfileUrl(slug: string): string {
  return `https://www.linkedin.com/in/${slug}`;
}
