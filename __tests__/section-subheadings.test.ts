import { describe, expect, it } from 'vitest';

import {
  addSubHeadingGroup,
  createDefaultSubHeadings,
  DEFAULT_SUBHEADING_LABELS,
  flattenSubheadingSortableIds,
  groupEntriesBySubheadings,
  hasLabeledSubheadingGroups,
  moveFlattenedSortableIds,
  parseSubHeadings,
  rebuildSubHeadingsFromSortableIds,
  remapSubHeadingEntryIds,
  removeSubHeadingGroup,
  splitIdsEvenly,
  toSubheadingSortableId,
} from '@/lib/section-subheadings';

describe('section sub-headings', () => {
  it('treats missing or empty JSON as off', () => {
    expect(parseSubHeadings(null)).toBeNull();
    expect(parseSubHeadings({})).toBeNull();
    expect(parseSubHeadings({ groups: [] })).toBeNull();
  });

  it('creates Sub-heading 1 and Sub-heading 2 and splits odd counts toward the first group', () => {
    expect(splitIdsEvenly(['a', 'b', 'c', 'd', 'e'])).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    const created = createDefaultSubHeadings(['a', 'b', 'c']);
    expect(created.groups.map((group) => group.label)).toEqual([
      DEFAULT_SUBHEADING_LABELS.first,
      DEFAULT_SUBHEADING_LABELS.second,
    ]);
    expect(created.groups[0]?.entryIds).toEqual(['a', 'b']);
    expect(created.groups[1]?.entryIds).toEqual(['c']);
  });

  it('groups two out-of-order entries under a featured label and the rest under catch-all', () => {
    const items = [
      { id: 'w1', role: 'Current' },
      { id: 'w2', role: 'Mid' },
      { id: 'w3', role: 'Older' },
      { id: 'w4', role: 'Oldest' },
    ];
    const grouped = groupEntriesBySubheadings(items, {
      groups: [
        { id: 'featured', label: 'Most Relevant', entryIds: ['w1', 'w3'] },
        { id: 'other', label: 'Other combined', catchAll: true, entryIds: [] },
      ],
    });

    expect(grouped.map((group) => group.label)).toEqual(['Most Relevant', 'Other combined']);
    expect(grouped[0]?.entries.map((entry) => entry.id)).toEqual(['w1', 'w3']);
    expect(grouped[1]?.entries.map((entry) => entry.id)).toEqual(['w2', 'w4']);
    expect(hasLabeledSubheadingGroups(grouped)).toBe(true);
  });

  it('hides empty featured groups and keeps leftover entries in catch-all', () => {
    const grouped = groupEntriesBySubheadings([{ id: 'a' }, { id: 'b' }], {
      groups: [
        { id: 'featured', label: 'Most Relevant', entryIds: ['missing'] },
        { id: 'other', label: 'Other combined', catchAll: true },
      ],
    });
    expect(grouped).toEqual([
      { id: 'other', label: 'Other combined', entries: [{ id: 'a' }, { id: 'b' }] },
    ]);
  });

  it('leaves the original order when sub-headings are off', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(groupEntriesBySubheadings(items, null)).toEqual([
      { id: 'all', label: null, entries: items },
    ]);
    expect(hasLabeledSubheadingGroups(groupEntriesBySubheadings(items, null))).toBe(false);
  });

  it('moves entries within a group, across groups, and drops onto a heading', () => {
    const ids = ['sh:g1', 'a', 'b', 'sh:g2', 'c'];
    expect(moveFlattenedSortableIds(ids, 'b', 'a')).toEqual(['sh:g1', 'b', 'a', 'sh:g2', 'c']);
    expect(moveFlattenedSortableIds(ids, 'c', 'b')).toEqual(['sh:g1', 'a', 'c', 'b', 'sh:g2']);
    expect(moveFlattenedSortableIds(ids, 'c', 'sh:g1')).toEqual(['sh:g1', 'c', 'a', 'b', 'sh:g2']);
  });

  it('moves a sub-heading as a block with its entries', () => {
    const ids = ['sh:g1', 'a', 'b', 'sh:g2', 'c'];
    expect(moveFlattenedSortableIds(ids, 'sh:g2', 'sh:g1')).toEqual([
      'sh:g2',
      'c',
      'sh:g1',
      'a',
      'b',
    ]);
    expect(moveFlattenedSortableIds(ids, 'sh:g1', 'sh:g2')).toEqual([
      'sh:g2',
      'c',
      'sh:g1',
      'a',
      'b',
    ]);
  });

  it('rebuilds groups from the flattened sortable list', () => {
    const current = {
      groups: [
        { id: 'g1', label: 'Sub-heading 1', entryIds: ['a', 'b'] },
        { id: 'g2', label: 'Sub-heading 2', entryIds: ['c'] },
      ],
    };
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const flattened = flattenSubheadingSortableIds(items, current);
    expect(flattened).toEqual([
      toSubheadingSortableId('g1'),
      'a',
      'b',
      toSubheadingSortableId('g2'),
      'c',
    ]);

    const moved = moveFlattenedSortableIds(flattened, 'c', 'a');
    const rebuilt = rebuildSubHeadingsFromSortableIds(moved, current);
    expect(rebuilt.entryIds).toEqual(['c', 'a', 'b']);
    expect(rebuilt.groups.map((group) => ({ id: group.id, entryIds: group.entryIds }))).toEqual([
      { id: 'g1', entryIds: ['c', 'a', 'b'] },
      { id: 'g2', entryIds: [] },
    ]);
  });

  it('merges deleted group entries into the neighbor without reversing overall order', () => {
    const current = {
      groups: [
        { id: 'g1', label: 'Sub-heading 1', entryIds: ['a'] },
        { id: 'g2', label: 'Sub-heading 2', entryIds: ['b'] },
      ],
    };
    const withoutFirst = removeSubHeadingGroup(current, 'g1');
    expect(withoutFirst?.groups).toEqual([
      { id: 'g2', label: 'Sub-heading 2', entryIds: ['a', 'b'] },
    ]);
    expect(removeSubHeadingGroup(withoutFirst, 'g2')).toBeNull();
  });

  it('caps groups and remaps cloned entry ids', () => {
    let current = createDefaultSubHeadings();
    for (let i = 0; i < 10; i += 1) {
      current = addSubHeadingGroup(current, `Extra ${i}`);
    }
    expect(current.groups.length).toBeLessThanOrEqual(8);

    const remapped = remapSubHeadingEntryIds(
      {
        groups: [{ id: 'g1', label: 'Sub-heading 1', entryIds: ['old-1', 'old-2'] }],
      },
      new Map([
        ['old-1', 'new-1'],
        ['old-2', 'new-2'],
      ])
    );
    expect(remapped?.groups[0]?.entryIds).toEqual(['new-1', 'new-2']);
  });
});
