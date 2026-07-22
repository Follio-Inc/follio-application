/**
 * Clerk environment helpers.
 *
 * Production on follio.me must use a Clerk Production instance (`pk_live_` /
 * `sk_live_`). Development keys load Clerk from `*.accounts.dev`, so Google's
 * OAuth consent screen shows "accounts.dev" instead of Follio — even after
 * Google brand verification.
 */

export function isClerkDevelopmentPublishableKey(key: string | undefined): boolean {
  return Boolean(key?.startsWith('pk_test_'));
}

export function getClerkAuthorizedParties(
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL
): string[] | undefined {
  if (!appUrl) return undefined;

  try {
    const url = new URL(appUrl);
    const origin = url.origin;
    const parties = new Set<string>([origin]);

    // Include both apex and www when either is configured.
    if (url.hostname.startsWith('www.')) {
      parties.add(`${url.protocol}//${url.hostname.slice(4)}`);
    } else if (url.hostname.includes('.')) {
      parties.add(`${url.protocol}//www.${url.hostname}`);
    }

    return [...parties];
  } catch {
    return undefined;
  }
}

/** Warn (never throw) when a production deploy still points at Clerk Development. */
export function warnIfClerkDevelopmentKeysInProduction(
  publishableKey: string | undefined = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  nodeEnv: string | undefined = process.env.NODE_ENV
): void {
  if (nodeEnv !== 'production') return;
  if (!isClerkDevelopmentPublishableKey(publishableKey)) return;

  console.error(
    '[follio] NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a Development key (pk_test_). ' +
      'Google Sign-In will show accounts.dev instead of Follio. ' +
      'Activate Clerk Production, add DNS, wire your Google OAuth client, then set pk_live_/sk_live_ in the host env and redeploy. ' +
      'See https://clerk.com/docs/deployments/overview'
  );
}
