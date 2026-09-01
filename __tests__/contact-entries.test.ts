import { describe, expect, it } from 'vitest';

import {
  createDraftLinkEntryId,
  isDraftContactEntryId,
  mergeContactEntries,
  normalizeLinkUrl,
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
