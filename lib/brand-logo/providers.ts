/**
 * Logo sources, best quality first.
 *
 * Clearbit's free logo API — the long-time default for this job — shut down in
 * December 2025. Hunter's endpoint replaces it with no key required, so Follio
 * works out of the box; setting `LOGO_DEV_TOKEN` upgrades quality and coverage.
 *
 * Visitors never talk to these hosts directly. Requests go through our own
 * route so we control caching and leak no viewer IPs to third parties.
 */

export type LogoProvider = {
  id: string;
  /** Absent when the provider needs configuration that is not present. */
  url: (domain: string) => string | null;
  /** Shown in docs/UI when attribution is required by the provider's terms. */
  attribution?: string;
};

const PROVIDERS: LogoProvider[] = [
  {
    id: 'logo.dev',
    url: (domain) => {
      const token = process.env.LOGO_DEV_TOKEN?.trim();
      if (!token) return null;
      const params = new URLSearchParams({
        token,
        size: '256',
        format: 'png',
        // Never accept a generated placeholder — we render our own monogram,
        // which matches the rest of the page.
        fallback: '404',
      });
      return `https://img.logo.dev/${domain}?${params.toString()}`;
    },
    attribution: 'Logos provided by Logo.dev',
  },
  {
    id: 'hunter',
    url: (domain) => `https://logos.hunter.io/${domain}`,
    // Required only above 50k requests/day.
    attribution: 'Logos provided by Hunter',
  },
  // Favicon services (DuckDuckGo, Google S2) were evaluated and left out: they
  // mostly return `.ico` files, which sharp cannot decode, and at best yield a
  // 32px favicon rather than an official logo. A monogram looks better.
];

/** Providers that are usable given the current configuration. */
export function activeProviders(): LogoProvider[] {
  return PROVIDERS.filter((provider) => provider.url('example.com') !== null);
}
