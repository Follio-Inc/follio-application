/**
 * URL Helper Utilities
 *
 * Two types of URLs:
 *
 * 1. CANONICAL / DISPLAY URLs (for sharing, OG tags, copy-to-clipboard):
 *    Always use the subdomain format:
 *      Portfolio:  https://username.follio.me
 *      Resume:     https://username.follio.me/r
 *      Links:      https://username.follio.me/l
 *      Unlisted:   https://username.follio.me?key=UNLISTED_KEY
 *
 * 2. INTERNAL NAV PATHS (for <Link>, redirect(), Next.js routing):
 *    Always use the path-based format so Next.js routing works:
 *      Portfolio:  /u/username
 *      Resume:     /u/username/resume
 *      Links:      /u/username/links
 */

/** The root domain (e.g., "follio.me") */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'follio.me';

/** The protocol to use */
export const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';

// ─── Canonical / Display URLs ────────────────────────────────────────

/**
 * Canonical portfolio URL for display, sharing, OG tags.
 * Always returns: https://username.follio.me
 */
export function getPortfolioUrl(handle: string, unlistedKey?: string | null): string {
  const base = `${PROTOCOL}://${handle}.${ROOT_DOMAIN}`;
  return unlistedKey ? `${base}?key=${unlistedKey}` : base;
}

/**
 * Canonical resume URL for display, sharing, OG tags.
 * Always returns: https://username.follio.me/r
 */
export function getResumeUrl(handle: string, unlistedKey?: string | null): string {
  const base = `${PROTOCOL}://${handle}.${ROOT_DOMAIN}/r`;
  return unlistedKey ? `${base}?key=${unlistedKey}` : base;
}

/**
 * Canonical links URL for display, sharing, OG tags.
 * Always returns: https://username.follio.me/l
 */
export function getLinksUrl(handle: string, unlistedKey?: string | null): string {
  const base = `${PROTOCOL}://${handle}.${ROOT_DOMAIN}/l`;
  return unlistedKey ? `${base}?key=${unlistedKey}` : base;
}

// ─── Internal Navigation Paths ───────────────────────────────────────

/**
 * Internal path for portfolio — use in <Link href>, redirect(), etc.
 */
export function getPortfolioPath(handle: string): string {
  return `/u/${handle}`;
}

/**
 * Internal path for resume — use in <Link href>, redirect(), etc.
 */
export function getResumePath(handle: string): string {
  return `/u/${handle}/resume`;
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
