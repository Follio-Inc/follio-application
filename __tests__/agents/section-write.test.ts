import { describe, expect, it } from 'vitest';

import {
  mergeNarrativePatches,
  type NarrativePatches,
} from '@/services/agents/portfolio/section-write';

describe('mergeNarrativePatches', () => {
  it('merges section patches into a full narrative draft', () => {
    const patches: NarrativePatches[] = [
      { headline: 'I build systems', subheadline: 'Engineer at Acme' },
      { introParagraph: 'She builds reliable platforms.', metaBio: 'Ada builds platforms.' },
      { experienceNarrative: 'From startups to scale.' },
      { projectFramings: { Widget: 'A widget that ships.' } },
      { writingNarrative: null },
      { githubNarrative: 'Active open source contributor.' },
      { ctaText: "Let's talk" },
    ];

    const merged = mergeNarrativePatches(patches);
    expect(merged.headline).toBe('I build systems');
    expect(merged.introParagraph).toContain('platforms');
    expect(merged.projectFramings.Widget).toContain('widget');
    expect(merged.writingNarrative).toBeNull();
    expect(merged.githubNarrative).toContain('open source');
    expect(merged.ctaText).toBe("Let's talk");
  });
});
