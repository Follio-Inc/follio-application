/**
 * URL Helper Utilities
 *
 * Two types of URLs:
 *
 * 1. CANONICAL / DISPLAY URLs (for sharing, OG tags, copy-to-clipboard):
 *    Follio / work / links are environment-aware (subdomain when enabled):
 *      Follio:    https://username.follio.me      or /u/username
 *      Work:      https://username.follio.me/work or /u/username/work
 *
 *    Resume URLs are always apex-path (never embed the username in unlisted links):
 *      Public:   https://follio.me/username
 *      Unlisted: https://follio.me/r/{unlistedKey}
 *
 * 2. INTERNAL NAV PATHS (for <Link>, redirect(), Next.js routing):
 *    Always use the path-based format so Next.js routing works:
 *      Follio:            /u/username
 *      Work:              /u/username/work
 *      Resume (legacy):   /u/username/resume
 *      Public resume:     /username
 *      Unlisted resume:   /r/{key}
 *      Unlisted cover letter: /cl/{key}
 *      Links:             /u/username/links
 */

/** The root domain (e.g., "follio.me") */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'follio.me';

/** The protocol to use */
export const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';

/** Whether subdomain routing is active (DNS wildcards configured) */
export const SUBDOMAIN_ENABLED = process.env.NEXT_PUBLIC_SUBDOMAIN_ENABLED === 'true';

/**
 * Base URL for the app — respects NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.
 * Used as the origin when subdomains are not enabled.
 */
function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

// ─── Canonical / Display URLs ────────────────────────────────────────

function withOptionalKey(base: string, unlistedKey?: string | null): string {
  return unlistedKey ? `${base}?key=${unlistedKey}` : base;
}

/**
 * Canonical Follio URL — the one link people share.
 * Subdomain ON:  https://username.follio.me
 * Subdomain OFF: http://localhost:3000/u/username
 */
export function getFollioUrl(handle: string, unlistedKey?: string | null): string {
  const base = SUBDOMAIN_ENABLED
    ? `${PROTOCOL}://${handle}.${ROOT_DOMAIN}`
    : `${getAppBaseUrl()}/u/${handle}`;
  return withOptionalKey(base, unlistedKey);
}

/**
 * Canonical work (portfolio) URL.
 * Subdomain ON:  https://username.follio.me/work
 * Subdomain OFF: http://localhost:3000/u/username/work
 */
export function getPortfolioUrl(handle: string, unlistedKey?: string | null): string {
  const base = SUBDOMAIN_ENABLED
    ? `${PROTOCOL}://${handle}.${ROOT_DOMAIN}/work`
    : `${getAppBaseUrl()}/u/${handle}/work`;
  return withOptionalKey(base, unlistedKey);
}

/**
 * Apex origin for vanity / opaque resume URLs (always path-based on the app host).
 * Production: https://follio.me
 * Dev:        http://localhost:3000 (or NEXT_PUBLIC_APP_URL)
 */
function getApexBaseUrl(): string {
  if (SUBDOMAIN_ENABLED) {
    return `${PROTOCOL}://${ROOT_DOMAIN}`;
  }
  return getAppBaseUrl();
}

/**
 * Canonical public resume URL: follio.me/{username}
 */
export function getPublicResumeUrl(username: string): string {
  return `${getApexBaseUrl()}/${username}`;
}

/**
 * Canonical unlisted resume URL: follio.me/r/{unlistedKey}
 * Intentionally omits the username so the link cannot be used to discover
 * a public vanity URL.
 */
export function getUnlistedResumeUrl(unlistedKey: string): string {
  return `${getApexBaseUrl()}/r/${unlistedKey}`;
}

/**
 * Canonical resume URL for display, sharing, OG tags.
 * - With unlistedKey → opaque /r/{key} (no username)
 * - Without key → public vanity /{username}
 */
export function getResumeUrl(username: string, unlistedKey?: string | null): string {
  if (unlistedKey) {
    return getUnlistedResumeUrl(unlistedKey);
  }
  return getPublicResumeUrl(username);
}

/**
 * Canonical links URL for display, sharing, OG tags.
 * Subdomain ON:  https://username.follio.me/l
 * Subdomain OFF: http://localhost:3000/u/username/links
 */
export function getLinksUrl(handle: string, unlistedKey?: string | null): string {
  const base = SUBDOMAIN_ENABLED
    ? `${PROTOCOL}://${handle}.${ROOT_DOMAIN}/l`
    : `${getAppBaseUrl()}/u/${handle}/links`;
  return unlistedKey ? `${base}?key=${unlistedKey}` : base;
}

/**
 * Short display string for URLs (no protocol) — used in UI labels.
 * Subdomain ON:  username.follio.me
 * Subdomain OFF: localhost:3000/u/username
 */
export function getDisplayHost(handle: string, suffix?: string): string {
  if (SUBDOMAIN_ENABLED) {
    return `${handle}.${ROOT_DOMAIN}${suffix || ''}`;
  }
  const host = getAppBaseUrl().replace(/^https?:\/\//, '');
  return `${host}/u/${handle}${suffix || ''}`;
}

// ─── Internal Navigation Paths ───────────────────────────────────────

/**
 * Internal path for the Follio — use in <Link href>, redirect(), etc.
 */
export function getFollioPath(handle: string): string {
  return `/u/${handle}`;
}

/**
 * Owner-dashboard iframe of the live Follio. `preview=true` strips workspace
 * chrome so the snapshot matches what visitors see.
 */
export function getFollioPreviewPath(handle: string): string {
  return `/u/${handle}?preview=true`;
}

/**
 * Internal path for work (portfolio) — use in <Link href>, redirect(), etc.
 */
export function getPortfolioPath(handle: string): string {
  return `/u/${handle}/work`;
}

/**
 * Internal path for resume — use in <Link href>, redirect(), etc.
 * Legacy handle-based path (still valid for owners / backwards compat).
 */
export function getResumePath(handle: string): string {
  return `/u/${handle}/resume`;
}

/** Internal path for the public vanity resume URL. */
export function getPublicResumePath(username: string): string {
  return `/${username}`;
}

/** Internal path for an opaque unlisted resume URL. */
export function getUnlistedResumePath(unlistedKey: string): string {
  return `/r/${unlistedKey}`;
}

/**
 * Short display string for public resume URLs (no protocol).
 * Always apex-path: follio.me/username or localhost:3000/username
 */
export function getPublicResumeDisplayHost(username: string): string {
  return getPublicResumeUrl(username).replace(/^https?:\/\//, '');
}

/**
 * Short display string for unlisted resume URLs (no protocol).
 */
export function getUnlistedResumeDisplayHost(unlistedKey: string): string {
  return getUnlistedResumeUrl(unlistedKey).replace(/^https?:\/\//, '');
}

/**
 * Canonical unlisted cover letter URL: follio.me/cl/{unlistedKey}
 * Opaque — does not include a username.
 */
export function getUnlistedCoverLetterUrl(unlistedKey: string): string {
  return `${getApexBaseUrl()}/cl/${unlistedKey}`;
}

/** Internal path for an opaque unlisted cover letter URL. */
export function getUnlistedCoverLetterPath(unlistedKey: string): string {
  return `/cl/${unlistedKey}`;
}

/** Short display string for unlisted cover letter URLs (no protocol). */
export function getUnlistedCoverLetterDisplayHost(unlistedKey: string): string {
  return getUnlistedCoverLetterUrl(unlistedKey).replace(/^https?:\/\//, '');
}

/**
 * Internal path for links — use in <Link href>, redirect(), etc.
 */
export function getLinksPath(handle: string): string {
  return `/u/${handle}/links`;
}

// ─── Subdomain Helpers ───────────────────────────────────────────────

/**
 * Extract handle from a subdomain hostname.
 * Returns null if the hostname is not a valid subdomain.
 *
 * Examples:
 *   "john.follio.me"     → "john"
 *   "follio.me"          → null
 *   "www.follio.me"      → null (www is reserved)
 *   "localhost"           → null
 */
export function extractHandleFromHost(hostname: string): string | null {
  // Remove port if present
  const host = hostname.split(':')[0];

  // Must end with the root domain
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null;

  // Extract the subdomain part
  const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));

  // Must be a single-level subdomain (no dots) and not reserved
  if (!subdomain || subdomain.includes('.')) return null;

  const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'mail', 'blog', 'docs', 'status'];
  if (RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())) return null;

  return subdomain.toLowerCase();
}

/**
 * Check if a request is for the main app domain (not a user subdomain)
 */
export function isMainDomain(hostname: string): boolean {
  const host = hostname.split(':')[0];
  return (
    host === ROOT_DOMAIN ||
    host === `www.${ROOT_DOMAIN}` ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}
