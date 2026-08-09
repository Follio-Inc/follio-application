/**
 * Resolve the account-menu public resume link.
 *
 * Product rules:
 * - Only the account's single PUBLIC resume (vanity URL) belongs here.
 * - Unlisted and private resumes are shared from the Share dialog — never
 *   advertised in the account menu.
 *
 * Never fall back to the owner preview path (/u/{handle}/resume).
 */

import { getPublicResumeDisplayHost, getPublicResumePath, getPublicResumeUrl } from '@/lib/url';

export type PublicResumeLink = {
  kind: 'public';
  /** Canonical absolute URL for copy/share. */
  url: string;
  /** Internal path for <Link href> / preview — matches the shareable URL. */
  href: string;
  /** Short host path for compact UI labels. */
  displayHost: string;
  label: string;
};

export type ResolvePublicResumeLinkInput = {
  /** True when any non-archived resume for the user is PUBLIC. */
  hasPublicResume: boolean;
  vanityUsername?: string | null;
  activeHandle?: string | null;
};

export function resolvePublicResumeLink(
  input: ResolvePublicResumeLinkInput
): PublicResumeLink | null {
  if (!input.hasPublicResume) return null;

  const username = (input.vanityUsername || input.activeHandle || '').trim().toLowerCase();
  if (!username) return null;

  return {
    kind: 'public',
    url: getPublicResumeUrl(username),
    href: getPublicResumePath(username),
    displayHost: getPublicResumeDisplayHost(username),
    label: 'Public resume',
  };
}
