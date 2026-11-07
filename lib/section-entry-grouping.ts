/**
 * Consecutive same-organization grouping (group promotion).
 *
 * Grouping never invents parent/child entries. It only restyles entries that
 * already sit next to each other and share an organization name.
 *
 *   off      — default layout (org on every entry)
 *   repeats  — promote org only when 2+ consecutive entries share it
 *   all      — every entry uses org-on-top + vertical line; different orgs
 *              stay separate, and a single-entry org still gets the style
 */

export const ENTRY_GROUPING_SECTION_TYPES = new Set([
  'EXPERIENCE',
  'EDUCATION',
  'VOLUNTEERING',
  'AWARDS',
  'CERTIFICATIONS',
  'CUSTOM',
]);

export type EntryGroupingMode = 'off' | 'repeats' | 'all';
export type EntryGroupingStored = 'REPEATS' | 'ALL' | null;

export interface ConsecutiveOrgGroup<T extends { id: string }> {
  id: string;
  orgName: string;
  /** Shared location when every entry in the run has the same one; otherwise null. */
  location: string | null;
  locationShared: boolean;
  entries: T[];
  grouped: boolean;
}

export function parseEntryGrouping(value: unknown): EntryGroupingMode {
  if (value == null) return 'off';
  const raw = typeof value === 'string' ? value : '';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'REPEATS' || normalized === 'REPEAT' || normalized === 'MATCHING') {
    return 'repeats';
  }
  if (normalized === 'ALL') return 'all';
  return 'off';
}

export function serializeEntryGrouping(mode: EntryGroupingMode): EntryGroupingStored {
  if (mode === 'repeats') return 'REPEATS';
  if (mode === 'all') return 'ALL';
  return null;
}

export function isEntryGroupingEnabled(value: unknown): boolean {
  return parseEntryGrouping(value) !== 'off';
}

/** Case-insensitive, punctuation-insensitive org identity. Empty means "no org". */
export function orgKey(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function orgGroupHeaderLabel(orgName: string, location?: string | null): string {
  return [orgName.trim(), location?.trim()].filter(Boolean).join(', ');
}

function readOrg(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function sharedLocation<T>(
  entries: T[],
  locationOf?: (item: T) => string | null | undefined
): { location: string | null; shared: boolean } {
  if (!locationOf || entries.length === 0) {
    return { location: null, shared: true };
  }
  const values = entries.map((item) => readOrg(locationOf(item)));
  const keys = new Set(values.map((value) => value.toLowerCase()));
  if (keys.size !== 1) return { location: null, shared: false };
  return { location: values[0] || null, shared: true };
}

function ungroupedRun<T extends { id: string }>(
  item: T,
  orgOf: (item: T) => string | null | undefined,
  locationOf?: (item: T) => string | null | undefined
): ConsecutiveOrgGroup<T> {
  const location = readOrg(locationOf?.(item)) || null;
  return {
    id: item.id,
    orgName: readOrg(orgOf(item)),
    location,
    locationShared: true,
    entries: [item],
    grouped: false,
  };
}

/**
 * Collapse consecutive items that share an org key. Different orgs never merge,
 * even in `all` mode. Empty org names never group.
 */
export function groupConsecutiveByOrg<T extends { id: string }>(
  items: T[],
  orgOf: (item: T) => string | null | undefined,
  mode: EntryGroupingMode,
  locationOf?: (item: T) => string | null | undefined
): ConsecutiveOrgGroup<T>[] {
  if (mode === 'off' || items.length === 0) {
    return items.map((item) => ungroupedRun(item, orgOf, locationOf));
  }

  const runs: T[][] = [];
  for (const item of items) {
    const key = orgKey(orgOf(item));
    const last = runs[runs.length - 1];
    const lastKey = last ? orgKey(orgOf(last[0])) : '';
    if (last && key && lastKey && key === lastKey) {
      last.push(item);
    } else {
      runs.push([item]);
    }
  }

  return runs.map((run) => {
    const orgName = readOrg(orgOf(run[0]));
    const hasOrg = Boolean(orgKey(orgName));
    const grouped = hasOrg && (mode === 'all' || run.length > 1);
    const { location, shared } = sharedLocation(run, locationOf);
    return {
      id: run[0].id,
      orgName,
      location,
      locationShared: shared,
      entries: run,
      grouped,
    };
  });
}

export type MixedOrgListChunk<T extends { id: string }> =
  | { type: 'heading'; id: string }
  | { type: 'org'; group: ConsecutiveOrgGroup<T> };

/**
 * Walk a mixed sub-heading + entry id list and wrap consecutive same-org
 * entries. Headings always break a run.
 */
export function chunkMixedIdsByOrg<T extends { id: string }>(
  sortableIds: string[],
  itemsById: Map<string, T>,
  isHeadingId: (id: string) => boolean,
  orgOf: (item: T) => string | null | undefined,
  mode: EntryGroupingMode,
  locationOf?: (item: T) => string | null | undefined
): MixedOrgListChunk<T>[] {
  const chunks: MixedOrgListChunk<T>[] = [];
  let run: T[] = [];

  const flush = () => {
    if (run.length === 0) return;
    for (const group of groupConsecutiveByOrg(run, orgOf, mode, locationOf)) {
      chunks.push({ type: 'org', group });
    }
    run = [];
  };

  for (const id of sortableIds) {
    if (isHeadingId(id)) {
      flush();
      chunks.push({ type: 'heading', id });
      continue;
    }
    const item = itemsById.get(id);
    if (!item) continue;
    run.push(item);
  }
  flush();
  return chunks;
}
