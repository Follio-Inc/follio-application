import { isReverificationCancelledError } from '@clerk/nextjs/errors';

export type OAuthConnectStrategy = 'oauth_github' | 'oauth_linkedin_oidc' | 'oauth_google';

export const OAUTH_CONNECT_LABELS: Record<OAuthConnectStrategy, string> = {
  oauth_github: 'GitHub',
  oauth_linkedin_oidc: 'LinkedIn',
  oauth_google: 'Google',
};

export type MappedExternalAccountConnectError =
  | { kind: 'cancelled' }
  | { kind: 'already_connected' }
  | { kind: 'error'; message: string };

function errorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return 'Could not connect this account';
}

/**
 * Map Clerk OAuth-link failures into UI outcomes.
 * Linking a new provider is a sensitive action; Clerk may require step-up auth.
 */
export function mapExternalAccountConnectError(
  err: unknown,
  providerLabel: string
): MappedExternalAccountConnectError {
  if (isReverificationCancelledError(err)) {
    return { kind: 'cancelled' };
  }

  const message = errorText(err);
  const lower = message.toLowerCase();

  if (lower.includes('already connected')) {
    return { kind: 'already_connected' };
  }

  if (lower.includes('additional verification') || lower.includes('reverification')) {
    return {
      kind: 'error',
      message: `Confirm it's you, then try connecting ${providerLabel} again.`,
    };
  }

  return { kind: 'error', message };
}

export function githubConnectFallbackHint(message: string): string {
  return `${message} You can also import by entering your GitHub username — no account connection needed.`;
}
