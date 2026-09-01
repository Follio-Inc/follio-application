/**
 * Process-local cache for Wikipedia brand insights.
 * Misses are remembered so an unknown employer does not hammer Wikipedia.
 */

const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 400;

export type CachedInsight = {
  name: string;
  description: string | null;
  summary: string;
  extract: string;
  sourceUrl: string | null;
};

type Entry = {
  value: CachedInsight | null;
  expiresAt: number;
};

const entries = new Map<string, Entry>();

export function insightCacheKey(kind: string, name: string, domainHint: string | null): string {
  return `${kind}:${name.trim().toLowerCase()}:${domainHint ?? ''}`;
}

export function readInsightCache(key: string): CachedInsight | null | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    entries.delete(key);
    return undefined;
  }
  return entry.value;
}

export function writeInsightCache(key: string, value: CachedInsight | null): void {
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }
  entries.set(key, {
    value,
    expiresAt: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS),
  });
}

/** Test seam. */
export function clearInsightCache(): void {
  entries.clear();
}
