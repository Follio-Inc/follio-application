export type PublicProfileAuthState = 'owner' | 'authenticated' | 'anonymous';

export interface PublicProfileChromeState {
  /** True when the page should look like an anonymous visitor sees it. */
  isVisitorChrome: boolean;
  /** Whether the authenticated top bar should be visible. */
  showHeader: boolean;
  /** Auth state used by page content (owner previewing as visitor → anonymous). */
  effectiveAuthState: PublicProfileAuthState;
  /** Whether the owner-only external-view toggle should render. */
  showExternalToggle: boolean;
}

/**
 * Pure resolver for public resume/portfolio chrome. Keeps header, footer,
 * and effective auth state in sync for anonymous visitors and owners
 * previewing their shared link.
 */
export function resolvePublicProfileChrome(
  authState: PublicProfileAuthState,
  externalView: boolean
): PublicProfileChromeState {
  const isOwner = authState === 'owner';
  const isVisitorChrome = authState === 'anonymous' || (isOwner && externalView);
  const showHeader = !isVisitorChrome;
  const effectiveAuthState: PublicProfileAuthState =
    isOwner && externalView ? 'anonymous' : authState;

  return {
    isVisitorChrome,
    showHeader,
    effectiveAuthState,
    showExternalToggle: isOwner,
  };
}
