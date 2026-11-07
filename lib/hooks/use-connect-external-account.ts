'use client';

import { useReverification, useUser } from '@clerk/nextjs';
import { useCallback } from 'react';

import {
  OAUTH_CONNECT_LABELS,
  githubConnectFallbackHint,
  mapExternalAccountConnectError,
  type OAuthConnectStrategy,
} from '@/lib/account/connect-external-account';

export type ConnectExternalAccountOutcome =
  | { status: 'redirected' }
  | { status: 'already_connected' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Link a Clerk OAuth provider, prompting for step-up verification when needed.
 * After a resume-only signup the session is often stale, so GitHub/LinkedIn/Google
 * connect must go through Clerk reverification instead of failing immediately.
 */
export function useConnectExternalAccount() {
  const { user } = useUser();

  const createExternalAccountWithReverification = useReverification(
    async (strategy: OAuthConnectStrategy, redirectUrl: string) => {
      if (!user) throw new Error('Sign in to connect an account');
      return user.createExternalAccount({ strategy, redirectUrl });
    }
  );

  return useCallback(
    async (
      strategy: OAuthConnectStrategy,
      options?: { redirectUrl?: string }
    ): Promise<ConnectExternalAccountOutcome> => {
      const label = OAUTH_CONNECT_LABELS[strategy];

      try {
        const externalAccount = await createExternalAccountWithReverification(
          strategy,
          options?.redirectUrl ?? window.location.href
        );
        const url = externalAccount?.verification?.externalVerificationRedirectURL;
        if (!url) {
          const message = `Couldn't start the ${label} connection. Try again.`;
          return {
            status: 'error',
            message: strategy === 'oauth_github' ? githubConnectFallbackHint(message) : message,
          };
        }
        window.location.href = url.toString();
        return { status: 'redirected' };
      } catch (err) {
        const mapped = mapExternalAccountConnectError(err, label);
        if (mapped.kind === 'cancelled') return { status: 'cancelled' };
        if (mapped.kind === 'already_connected') {
          await user?.reload();
          return { status: 'already_connected' };
        }
        return {
          status: 'error',
          message:
            strategy === 'oauth_github'
              ? githubConnectFallbackHint(mapped.message)
              : mapped.message,
        };
      }
    },
    [createExternalAccountWithReverification, user]
  );
}
