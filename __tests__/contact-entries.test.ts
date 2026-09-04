import { describe, expect, it } from 'vitest';

import {
  applyContactEntryOrder,
  createDraftLinkEntryId,
  isDraftContactEntryId,
  mergeContactEntries,
  normalizeLinkUrl,
  reconcileContactEntries,
} from '@/app/(dashboard)/builder/lib/contact-entries';

function entry(partial: {
  id: string;
  kind?: string;
  value?: string;
  isVisible?: boolean;
  linkType?: string;
  linkId?: string;
}) {
  return {
    kind: 'link' as const,
    value: '',
    isVisible: true,
    ...partial,
  };
}

describe('contact header drafts', () => {
  it('uses a stable placeholder id so GitHub can be added before a URL exists', () => {
    expect(createDraftLinkEntryId('GITHUB')).toBe('placeholder-GITHUB');
    expect(isDraftContactEntryId('placeholder-GITHUB')).toBe(true);
    expect(isDraftContactEntryId('new-GITHUB-1')).toBe(true);
    expect(isDraftContactEntryId('clk123')).toBe(false);
  });

  it('keeps an unsaved GitHub row when profile links have not been persisted yet', () => {
    const existing = [
      entry({ id: 'email', kind: 'email', value: 'a@b.com' }),
      entry({ id: 'placeholder-GITHUB', linkType: 'GITHUB' }),
    ];
    const fresh = [entry({ id: 'email', kind: 'email', value: 'a@b.com' })];

    const merged = mergeContactEntries(existing, fresh);
    expect(merged.map((row) => row.id)).toEqual(['email', 'placeholder-GITHUB']);
  });

  it('promotes a draft to the saved link of the same type instead of duplicating or dropping it', () => {
    const existing = [
      entry({ id: 'placeholder-GITHUB', linkType: 'GITHUB', value: 'https://github.com/ada' }),
    ];
    const fresh = [
      entry({
        id: 'link_1',
        linkId: 'link_1',
        linkType: 'GITHUB',
        value: 'https://github.com/ada',
      }),
    ];

    const merged = mergeContactEntries(existing, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('link_1');
    expect(merged[0]?.linkId).toBe('link_1');
    expect(merged[0]?.value).toBe('https://github.com/ada');
  });

  it('normalizes github.com paths and rejects non-web schemes', () => {
    expect(normalizeLinkUrl('github.com/ada')).toEqual({
      url: 'https://github.com/ada',
      error: null,
    });
    expect(normalizeLinkUrl('https://github.com/ada').error).toBeNull();
    expect(normalizeLinkUrl('').url).toBe('');
    // eslint-disable-next-line no-script-url
    expect(normalizeLinkUrl('javascript:alert(1)').error).toBeTruthy();
    expect(normalizeLinkUrl('not a url').error).toBeTruthy();
  });
});

describe('contact header order', () => {
  it('moves Location off the top when a stored order is present', () => {
    const rows = [
      entry({ id: 'location', kind: 'location', value: 'Austin, TX' }),
      entry({ id: 'email', kind: 'email', value: 'a@b.com' }),
      entry({ id: 'phone', kind: 'phone', value: '555' }),
    ];

    expect(
      applyContactEntryOrder(rows, ['email', 'phone', 'location']).map((row) => row.id)
    ).toEqual(['email', 'phone', 'location']);
  });

  it('appends rows that are missing from the stored order and ignores unknown ids', () => {
    const rows = [
      entry({ id: 'location', kind: 'location' }),
      entry({ id: 'email', kind: 'email' }),
      entry({ id: 'github', linkType: 'GITHUB' }),
    ];

    expect(
      applyContactEntryOrder(rows, ['email', 'missing', 'github']).map((row) => row.id)
    ).toEqual(['email', 'github', 'location']);
  });

  it('keeps a dragged Location order when a parent re-render still has the old local list', () => {
    const localBeforeDrag = [
      entry({ id: 'location', kind: 'location', value: 'Austin, TX' }),
      entry({ id: 'email', kind: 'email', value: 'a@b.com' }),
      entry({ id: 'phone', kind: 'phone', value: '555' }),
    ];
    const freshAfterDrag = [
      entry({ id: 'email', kind: 'email', value: 'a@b.com' }),
      entry({ id: 'phone', kind: 'phone', value: '555' }),
      entry({ id: 'location', kind: 'location', value: 'Austin, TX' }),
    ];

    expect(
      reconcileContactEntries(localBeforeDrag, freshAfterDrag, ['email', 'phone', 'location']).map(
        (row) => row.id
      )
    ).toEqual(['email', 'phone', 'location']);
  });
});
