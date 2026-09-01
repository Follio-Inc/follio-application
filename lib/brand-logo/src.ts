import type { BrandKind } from './domain';

/**
 * Client-safe helpers for pointing at the logo route. Kept free of `sharp` and
 * `fetch` so components can import them.
 */

export type BrandLogoSrcInput = {
  name: string;
  url?: string | null;
  kind: BrandKind;
};

/** URL of our own logo endpoint for a brand, or null when there is nothing to look up. */
export function brandLogoSrc({ name, url, kind }: BrandLogoSrcInput): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({ name: trimmed, kind });
  if (url?.trim()) params.set('url', url.trim());

  return `/api/brand/logo?${params.toString()}`;
}

/** Up to two letters, used when no logo resolves. */
export function brandMonogram(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter((word) => /[a-z0-9]/i.test(word));

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
