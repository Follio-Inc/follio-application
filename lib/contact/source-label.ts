/**
 * Contact source labels for onboarding / contact UI.
 * Signup emails are labeled with the OAuth portal when available (e.g. "Sign Up: Google").
 */

export type ExternalAccountLike = {
  provider: string;
  emailAddress?: string | null;
};

/** Map Clerk OAuth provider ids to a short display name. */
export function getOAuthProviderDisplayName(provider: string): string | null {
  const normalized = provider.toLowerCase().replace(/^oauth_/, '');
  if (normalized.includes('google')) return 'Google';
  if (normalized.includes('linkedin')) return 'LinkedIn';
  if (normalized.includes('github')) return 'GitHub';
  return null;
}

/**
 * Find the OAuth portal used for this email by matching Clerk external accounts.
 */
export function resolveSignupPortalName(
  email: string,
  externalAccounts: ExternalAccountLike[] | null | undefined
): string | null {
  if (!email || !externalAccounts?.length) return null;
  const normalized = email.toLowerCase().trim();
  const match = externalAccounts.find(
    (account) => account.emailAddress?.toLowerCase().trim() === normalized
  );
  if (!match) return null;
  return getOAuthProviderDisplayName(match.provider);
}

/**
 * Human-readable source badge label.
 * SIGNUP → "Sign Up: Google" when the email matches an OAuth account, else "Sign Up".
 */
export function formatContactSourceLabel(
  source: string,
  options?: {
    email?: string;
    externalAccounts?: ExternalAccountLike[] | null;
  }
): string {
  const raw = (source || '').trim();
  if (!raw) return 'Unknown';

  const upper = raw.toUpperCase();

  if (upper === 'SIGNUP' || upper.startsWith('SIGNUP:')) {
    const portalFromSource = upper.includes(':')
      ? getOAuthProviderDisplayName(upper.slice(upper.indexOf(':') + 1))
      : null;
    const portalFromAccounts =
      options?.email != null
        ? resolveSignupPortalName(options.email, options.externalAccounts)
        : null;
    const portal = portalFromAccounts || portalFromSource;
    return portal ? `Sign Up: ${portal}` : 'Sign Up';
  }

  switch (upper) {
    case 'RESUME':
      return 'Resume';
    case 'LINKEDIN':
      return 'LinkedIn';
    case 'GITHUB':
      return 'GitHub';
    case 'MANUAL':
      return 'Manual';
    default:
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
}
