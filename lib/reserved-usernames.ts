/**
 * Path segments that must never resolve as vanity usernames on `/{username}`.
 * Keep in sync with top-level App Router routes and marketing/system paths.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'apple-touch-icon.png',
  'builder',
  'contact',
  'dashboard',
  'data-sources',
  'favicon.ico',
  'lab',
  'me',
  'onboarding',
  'portfolio-preview',
  'preview',
  'privacy',
  'r',
  'resume-preview',
  'resumes',
  'settings',
  'share',
  'sign-in',
  'sign-up',
  'terms',
  'u',
  'www',
  'app',
  'docs',
  'blog',
  'mail',
  'status',
  'help',
  'support',
  'about',
  'pricing',
  'login',
  'logout',
  'auth',
  'account',
  'accounts',
  'static',
  'assets',
  'cdn',
  'health',
  'robots.txt',
  'sitemap.xml',
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}
