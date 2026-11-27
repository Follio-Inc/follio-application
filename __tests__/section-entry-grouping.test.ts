import { describe, expect, it } from 'vitest';

import {
  chunkMixedIdsByOrg,
  groupConsecutiveByOrg,
  orgGroupHeaderLabel,
  orgKey,
  parseEntryGrouping,
  serializeEntryGrouping,
} from '@/lib/section-entry-grouping';
import { toSubheadingSortableId } from '@/lib/section-subheadings';

type Item = { id: string; org: string; location?: string };

const item = (id: string, org: string, location?: string): Item => ({ id, org, location });

describe('section entry grouping', () => {
  it('treats missing values as off', () => {
    expect(parseEntryGrouping(null)).toBe('off');
    expect(parseEntryGrouping(undefined)).toBe('off');
    expect(parseEntryGrouping('OFF')).toBe('off');
    expect(parseEntryGrouping('nope')).toBe('off');
  });

  it('parses and serializes stored modes', () => {
    expect(parseEntryGrouping('REPEATS')).toBe('repeats');
    expect(parseEntryGrouping('all')).toBe('all');
    expect(serializeEntryGrouping('repeats')).toBe('REPEATS');
    expect(serializeEntryGrouping('all')).toBe('ALL');
    expect(serializeEntryGrouping('off')).toBeNull();
  });

  it('matches org names case-insensitively without merging punctuation-only differences of identity', () => {
    expect(orgKey('Google')).toBe(orgKey(' google '));
    expect(orgKey('Acme & Co')).toBe(orgKey('Acme and Co'));
    expect(orgKey('Google')).not.toBe(orgKey('Google Inc'));
    expect(orgKey('')).toBe('');
  });

  it('does not group when mode is off', () => {
    const grouped = groupConsecutiveByOrg(
      [item('a', 'Google'), item('b', 'Google')],
      (entry) => entry.org,
      'off'
    );
    expect(grouped).toHaveLength(2);
    expect(grouped.every((group) => group.grouped === false)).toBe(true);
  });

  it('groups only consecutive same-org runs in repeats mode', () => {
    const grouped = groupConsecutiveByOrg(
      [
        item('a', 'Google'),
        item('b', 'Google'),
        item('c', 'Stripe'),
        item('d', 'Google'),
        item('e', 'Stripe'),
        item('f', 'Stripe'),
      ],
      (entry) => entry.org,
      'repeats'
    );

    expect(grouped.map((group) => [group.orgName, group.entries.length, group.grouped])).toEqual([
      ['Google', 2, true],
      ['Stripe', 1, false],
      ['Google', 1, false],
      ['Stripe', 2, true],
    ]);
  });

  it('group-all still splits different orgs and styles singles', () => {
    const grouped = groupConsecutiveByOrg(
      [item('a', 'Google'), item('b', 'Stripe'), item('c', 'Stripe')],
      (entry) => entry.org,
      'all'
    );

    expect(grouped.map((group) => [group.orgName, group.entries.length, group.grouped])).toEqual([
      ['Google', 1, true],
      ['Stripe', 2, true],
    ]);
  });

  it('never groups empty organization names', () => {
    const grouped = groupConsecutiveByOrg(
      [item('a', ''), item('b', '  '), item('c', 'MIT')],
      (entry) => entry.org,
      'all'
    );
    expect(grouped[0]?.grouped).toBe(false);
    expect(grouped[1]?.grouped).toBe(false);
    expect(grouped[2]?.grouped).toBe(true);
  });

  it('puts a shared location on the group and flags mixed locations', () => {
    const shared = groupConsecutiveByOrg(
      [item('a', 'Google', 'NYC'), item('b', 'Google', 'NYC')],
      (entry) => entry.org,
      'repeats',
      (entry) => entry.location
    );
    expect(shared[0]?.locationShared).toBe(true);
    expect(shared[0]?.location).toBe('NYC');
    expect(orgGroupHeaderLabel(shared[0]!.orgName, shared[0]!.location)).toBe('Google, NYC');

    const mixed = groupConsecutiveByOrg(
      [item('a', 'Google', 'NYC'), item('b', 'Google', 'London')],
      (entry) => entry.org,
      'repeats',
      (entry) => entry.location
    );
    expect(mixed[0]?.locationShared).toBe(false);
    expect(mixed[0]?.location).toBeNull();
  });

  it('breaks consecutive runs at a sub-heading', () => {
    const headingId = toSubheadingSortableId('g1');
    const items = [item('a', 'Google'), item('b', 'Google'), item('c', 'Google')];
    const byId = new Map(items.map((entry) => [entry.id, entry]));
    const chunks = chunkMixedIdsByOrg(
      ['a', headingId, 'b', 'c'],
      byId,
      (id) => id === headingId,
      (entry) => entry.org,
      'repeats'
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(['org', 'heading', 'org']);
    if (chunks[0]?.type !== 'org' || chunks[2]?.type !== 'org') {
      throw new Error('expected org chunks');
    }
    expect(chunks[0].group.grouped).toBe(false);
    expect(chunks[2].group.grouped).toBe(true);
    expect(chunks[2].group.entries.map((entry) => entry.id)).toEqual(['b', 'c']);
  });
});
