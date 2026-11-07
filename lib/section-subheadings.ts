/**
 * Optional in-section sub-headings.
 *
 * Off by default: null or empty groups leave the section as a single list.
 * Stored as JSON on ProfileSection. Groups hold ordered entry ids so items can
 * move within a group or across groups without a separate sort model.
 */

export const MAX_SUBHEADING_GROUPS = 8;
export const MAX_SUBHEADING_LABEL = 40;
export const SUBHEADING_SORTABLE_PREFIX = 'sh:';

export const DEFAULT_SUBHEADING_LABELS = {
  first: 'Sub-heading 1',
  second: 'Sub-heading 2',
} as const;

export interface SectionSubHeadingGroup {
  id: string;
  label: string;
  entryIds: string[];
  /** Legacy leftover bucket from the first version of this feature. */
  catchAll?: boolean;
}

export interface SectionSubHeadings {
  groups: SectionSubHeadingGroup[];
}

export interface GroupedSubheadingEntries<T extends { id: string }> {
  id: string;
  label: string | null;
  entries: T[];
}

export function newSubHeadingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function toSubheadingSortableId(groupId: string): string {
  return `${SUBHEADING_SORTABLE_PREFIX}${groupId}`;
}

export function isSubheadingSortableId(id: string): boolean {
  return id.startsWith(SUBHEADING_SORTABLE_PREFIX);
}

export function fromSubheadingSortableId(id: string): string {
  return id.slice(SUBHEADING_SORTABLE_PREFIX.length);
}

/** First groups get the extra item when the count is odd. */
export function splitIdsEvenly(ids: string[], parts = 2): string[][] {
  const groupCount = Math.max(1, parts);
  if (ids.length === 0) return Array.from({ length: groupCount }, () => []);
  const base = Math.floor(ids.length / groupCount);
  const extra = ids.length % groupCount;
  const result: string[][] = [];
  let offset = 0;
  for (let index = 0; index < groupCount; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    result.push(ids.slice(offset, offset + size));
    offset += size;
  }
  return result;
}

export function createDefaultSubHeadings(entryIds: string[] = []): SectionSubHeadings {
  const [first, second] = splitIdsEvenly(entryIds, 2);
  return {
    groups: [
      { id: newSubHeadingId(), label: DEFAULT_SUBHEADING_LABELS.first, entryIds: first },
      { id: newSubHeadingId(), label: DEFAULT_SUBHEADING_LABELS.second, entryIds: second },
    ],
  };
}

export function nextSubHeadingLabel(groups: SectionSubHeadingGroup[]): string {
  const used = new Set(groups.map((group) => group.label.trim().toLowerCase()));
  let index = groups.length + 1;
  while (used.has(`sub-heading ${index}`)) index += 1;
  return `Sub-heading ${index}`;
}

function sanitizeLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SUBHEADING_LABEL);
}

function sanitizeEntryIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function parseSubHeadings(raw: unknown): SectionSubHeadings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const groupsRaw = (raw as { groups?: unknown }).groups;
  if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) return null;

  const groups: SectionSubHeadingGroup[] = [];
  const seenIds = new Set<string>();
  let catchAllAssigned = false;

  for (const item of groupsRaw) {
    if (groups.length >= MAX_SUBHEADING_GROUPS) break;
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const label = sanitizeLabel(record.label);
    if (!label) continue;
    let id =
      typeof record.id === 'string' && record.id.trim() ? record.id.trim() : newSubHeadingId();
    if (seenIds.has(id)) id = newSubHeadingId();
    seenIds.add(id);
    const catchAll = record.catchAll === true && !catchAllAssigned;
    if (catchAll) catchAllAssigned = true;
    groups.push({
      id,
      label,
      entryIds: sanitizeEntryIds(record.entryIds),
      ...(catchAll ? { catchAll: true } : {}),
    });
  }

  return groups.length > 0 ? { groups } : null;
}

export function isSubHeadingsEnabled(raw: unknown): boolean {
  return parseSubHeadings(raw) !== null;
}

export function setGroupLabel(
  current: SectionSubHeadings | null,
  groupId: string,
  label: string
): SectionSubHeadings | null {
  const parsed = parseSubHeadings(current);
  if (!parsed) return parsed;
  const nextLabel = sanitizeLabel(label);
  if (!nextLabel) return parsed;
  return {
    groups: parsed.groups.map((group) =>
      group.id === groupId ? { ...group, label: nextLabel } : group
    ),
  };
}

export function addSubHeadingGroup(
  current: SectionSubHeadings | null,
  label?: string
): SectionSubHeadings {
  const parsed = parseSubHeadings(current) ?? createDefaultSubHeadings();
  if (parsed.groups.length >= MAX_SUBHEADING_GROUPS) return parsed;
  return {
    groups: [
      ...parsed.groups,
      {
        id: newSubHeadingId(),
        label: sanitizeLabel(label) || nextSubHeadingLabel(parsed.groups),
        entryIds: [],
      },
    ],
  };
}

export function removeSubHeadingGroup(
  current: SectionSubHeadings | null,
  groupId: string
): SectionSubHeadings | null {
  const parsed = parseSubHeadings(current);
  if (!parsed) return null;
  const index = parsed.groups.findIndex((group) => group.id === groupId);
  if (index === -1) return parsed;
  const removed = parsed.groups[index];
  const remaining = parsed.groups.filter((group) => group.id !== groupId);
  if (remaining.length === 0) return null;
  const targetIndex = Math.max(0, index - 1);
  const target = remaining[targetIndex];
  const incoming = removed.entryIds.filter((id) => !target.entryIds.includes(id));
  remaining[targetIndex] = {
    ...target,
    entryIds: index === 0 ? [...incoming, ...target.entryIds] : [...target.entryIds, ...incoming],
  };
  return { groups: remaining };
}

export function pruneMissingSubHeadingEntries(
  current: SectionSubHeadings | null,
  knownIds: Iterable<string>
): SectionSubHeadings | null {
  const parsed = parseSubHeadings(current);
  if (!parsed) return null;
  const known = new Set(knownIds);
  return {
    groups: parsed.groups.map((group) => ({
      ...group,
      entryIds: group.entryIds.filter((id) => known.has(id)),
    })),
  };
}

function leftoverBucket(groups: SectionSubHeadingGroup[]): SectionSubHeadingGroup | null {
  return groups.find((group) => group.catchAll) ?? groups[groups.length - 1] ?? null;
}

/**
 * Split entries into labeled groups. Unknown ids fall into the catch-all or
 * last group. Empty groups are omitted on the resume unless `includeEmpty`.
 */
export function groupEntriesBySubheadings<T extends { id: string }>(
  items: T[],
  raw: unknown,
  options?: { includeEmpty?: boolean }
): GroupedSubheadingEntries<T>[] {
  const parsed = parseSubHeadings(raw);
  if (!parsed) {
    return [{ id: 'all', label: null, entries: items }];
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const groups: GroupedSubheadingEntries<T>[] = [];

  for (const group of parsed.groups) {
    const entries: T[] = [];
    for (const id of group.entryIds) {
      const item = byId.get(id);
      if (!item || used.has(id)) continue;
      used.add(id);
      entries.push(item);
    }
    groups.push({ id: group.id, label: group.label, entries });
  }

  const remaining = items.filter((item) => !used.has(item.id));
  if (remaining.length > 0) {
    const bucket = leftoverBucket(parsed.groups);
    const target = groups.find((group) => group.id === bucket?.id);
    if (target) {
      target.entries.push(...remaining);
    } else {
      groups.push({
        id: bucket?.id ?? 'ungrouped',
        label: bucket?.label ?? null,
        entries: remaining,
      });
    }
  }

  if (options?.includeEmpty) return groups;
  return groups.filter((group) => group.entries.length > 0);
}

export function hasLabeledSubheadingGroups<T extends { id: string }>(
  groups: GroupedSubheadingEntries<T>[]
): boolean {
  return groups.some((group) => Boolean(group.label) && group.entries.length > 0);
}

export function flattenSubheadingSortableIds<T extends { id: string }>(
  items: T[],
  raw: unknown
): string[] {
  const groups = groupEntriesBySubheadings(items, raw, { includeEmpty: true });
  const parsed = parseSubHeadings(raw);
  if (!parsed) return items.map((item) => item.id);

  const ids: string[] = [];
  for (const group of groups) {
    if (!parsed.groups.some((item) => item.id === group.id)) {
      ids.push(...group.entries.map((entry) => entry.id));
      continue;
    }
    ids.push(toSubheadingSortableId(group.id));
    ids.push(...group.entries.map((entry) => entry.id));
  }
  return ids;
}

function groupBlockRange(ids: string[], headerIndex: number): [number, number] {
  let end = headerIndex + 1;
  while (end < ids.length && !isSubheadingSortableId(ids[end])) end += 1;
  return [headerIndex, end];
}

/** Same index shift as `@dnd-kit/sortable` `arrayMove`. */
function arrayMoveIds(ids: string[], from: number, to: number): string[] {
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return ids;
  next.splice(to, 0, item);
  return next;
}

/**
 * Reorder a mixed list of sub-heading headers and entry ids.
 * Entry-to-entry moves use the same index shift as the existing list. Dropping
 * an entry on a heading places it first in that group. Header moves take the
 * heading and the entries currently under it as one block.
 */
export function moveFlattenedSortableIds(
  ids: string[],
  activeId: string,
  overId: string
): string[] {
  const oldIndex = ids.indexOf(activeId);
  const overIndex = ids.indexOf(overId);
  if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) return ids;

  if (!isSubheadingSortableId(activeId)) {
    if (!isSubheadingSortableId(overId)) {
      return arrayMoveIds(ids, oldIndex, overIndex);
    }
    const withoutActive = ids.filter((id) => id !== activeId);
    const headerIndex = withoutActive.indexOf(overId);
    if (headerIndex < 0) return ids;
    const next = withoutActive.slice();
    next.splice(headerIndex + 1, 0, activeId);
    return next;
  }

  const [start, end] = groupBlockRange(ids, oldIndex);
  const block = ids.slice(start, end);
  const remaining = [...ids.slice(0, start), ...ids.slice(end)];
  let insertAt = remaining.indexOf(overId);

  if (insertAt < 0) {
    insertAt = Math.min(overIndex, remaining.length);
  } else if (isSubheadingSortableId(overId) && oldIndex < overIndex) {
    const [, overEnd] = groupBlockRange(remaining, insertAt);
    insertAt = overEnd;
  } else if (!isSubheadingSortableId(overId) && oldIndex < overIndex) {
    insertAt += 1;
  }

  return [...remaining.slice(0, insertAt), ...block, ...remaining.slice(insertAt)];
}

export function rebuildSubHeadingsFromSortableIds(
  sortableIds: string[],
  current: SectionSubHeadings
): { groups: SectionSubHeadingGroup[]; entryIds: string[] } {
  const byId = new Map(current.groups.map((group) => [group.id, group]));
  const orderedGroups: SectionSubHeadingGroup[] = [];
  const entryIds: string[] = [];
  let currentGroup: SectionSubHeadingGroup | null = null;

  const startGroup = (groupId: string): SectionSubHeadingGroup => {
    const existing = byId.get(groupId);
    const next: SectionSubHeadingGroup = {
      id: groupId,
      label: existing?.label ?? nextSubHeadingLabel(orderedGroups),
      entryIds: [],
      ...(existing?.catchAll ? { catchAll: true } : {}),
    };
    orderedGroups.push(next);
    currentGroup = next;
    return next;
  };

  for (const id of sortableIds) {
    if (isSubheadingSortableId(id)) {
      startGroup(fromSubheadingSortableId(id));
      continue;
    }
    if (entryIds.includes(id)) continue;
    entryIds.push(id);
    if (!currentGroup) {
      const fallback = current.groups[0];
      if (fallback) currentGroup = startGroup(fallback.id);
    }
    currentGroup?.entryIds.push(id);
  }

  const seen = new Set(orderedGroups.map((group) => group.id));
  for (const group of current.groups) {
    if (!seen.has(group.id)) {
      orderedGroups.push({ ...group, entryIds: [] });
    }
  }

  return { groups: orderedGroups, entryIds };
}

export function reorderItemsByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const item = byId.get(id);
    if (!item || used.has(id)) continue;
    used.add(id);
    ordered.push(item);
  }
  for (const item of items) {
    if (!used.has(item.id)) ordered.push(item);
  }
  return ordered;
}

export function customContentItemIds(customContent: unknown): string[] {
  if (!customContent || typeof customContent !== 'object' || Array.isArray(customContent)) {
    return [];
  }
  const items = (customContent as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) ids.push(id);
  }
  return ids;
}

export const SUBHEADING_SECTION_TYPES = new Set([
  'EXPERIENCE',
  'EDUCATION',
  'PROJECTS',
  'AWARDS',
  'CERTIFICATIONS',
  'VOLUNTEERING',
  'PUBLICATIONS',
  'CUSTOM',
]);

export function remapSubHeadingEntryIds(
  raw: unknown,
  idMap: Map<string, string>
): SectionSubHeadings | null {
  const parsed = parseSubHeadings(raw);
  if (!parsed) return null;
  return {
    groups: parsed.groups.map((group) => ({
      ...group,
      entryIds: group.entryIds
        .map((id) => idMap.get(id) ?? id)
        .filter((id, index, all) => all.indexOf(id) === index),
    })),
  };
}
