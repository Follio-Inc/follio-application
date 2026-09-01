/**
 * Pure helpers for Contact & Links header rows.
 */

export interface ContactEntryLike {
  id: string;
  kind: string;
  value: string;
  isVisible: boolean;
  linkType?: string;
  linkId?: string;
}

/**
 * Accepts `github.com/user` as well as full http(s) URLs.
 * Rejects non-web schemes so we never persist `javascript:` / `data:` values.
 */
export function normalizeLinkUrl(raw: string): { url: string; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { url: '', error: null };

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: trimmed, error: 'Enter a web URL starting with https://' };
    }
    if (!parsed.hostname.includes('.')) {
      return { url: trimmed, error: 'Enter a valid URL' };
    }
    return { url: parsed.toString(), error: null };
  } catch {
    return { url: trimmed, error: 'Enter a valid URL' };
  }
}

export function isDraftContactEntryId(id: string): boolean {
  return id.startsWith('placeholder-') || id.startsWith('new-');
}

export function createDraftLinkEntryId(linkType: string): string {
  return `placeholder-${linkType}`;
}

/**
 * Reconcile local editor rows with a profile snapshot.
 * Keeps unsaved draft rows, and promotes a draft to the persisted link of the
 * same type so a just-created GitHub (etc.) does not appear twice or vanish.
 */
export function mergeContactEntries<T extends ContactEntryLike>(existing: T[], fresh: T[]): T[] {
  const existingIds = new Set(existing.map((entry) => entry.id));
  const claimedFreshIds = new Set<string>();
  const merged: T[] = [];

  for (const entry of existing) {
    const byId = fresh.find((candidate) => candidate.id === entry.id);
    if (byId) {
      merged.push({ ...entry, value: byId.value, isVisible: byId.isVisible });
      claimedFreshIds.add(byId.id);
      continue;
    }

    if (!isDraftContactEntryId(entry.id)) continue;

    const byType =
      entry.kind === 'link' && entry.linkType
        ? fresh.find(
            (candidate) =>
              candidate.kind === 'link' &&
              candidate.linkType === entry.linkType &&
              !claimedFreshIds.has(candidate.id) &&
              !existingIds.has(candidate.id)
          )
        : undefined;

    if (byType) {
      merged.push({
        ...entry,
        id: byType.id,
        linkId: byType.linkId,
        value: entry.value || byType.value,
        isVisible: entry.isVisible,
      });
      claimedFreshIds.add(byType.id);
    } else {
      merged.push(entry);
    }
  }

  for (const entry of fresh) {
    if (!claimedFreshIds.has(entry.id) && !existingIds.has(entry.id)) {
      merged.push(entry);
    }
  }

  return merged;
}
