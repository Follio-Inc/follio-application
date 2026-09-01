/**
 * Process-local cache for resolved logos.
 *
 * The CDN does the heavy lifting via long-lived response headers; this only
 * spares repeat work inside a single server instance, and — more importantly —
 * remembers misses so an unresolvable employer name does not trigger a fresh
 * round of provider requests on every render.
 */

const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Shorter, so a brand that becomes resolvable is picked up reasonably soon. */
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

type Entry = {
  body: Buffer | null;
  expiresAt: number;
};

const entries = new Map<string, Entry>();

export function cacheKey(kind: string, name: string, domainHint: string | null): string {
  return `${kind}:${name.trim().toLowerCase()}:${domainHint ?? ''}`;
}

/** Returns `undefined` on a cache miss, `null` for a remembered failure. */
export function readCache(key: string): Buffer | null | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt < Date.now()) {
    entries.delete(key);
    return undefined;
  }

  return entry.body;
}

export function writeCache(key: string, body: Buffer | null): void {
  if (entries.size >= MAX_ENTRIES) {
    // Oldest insertion first — good enough for a bounded, low-churn cache.
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  entries.set(key, {
    body,
    expiresAt: Date.now() + (body ? HIT_TTL_MS : MISS_TTL_MS),
  });
}

/** Test seam. */
export function clearCache(): void {
  entries.clear();
}
