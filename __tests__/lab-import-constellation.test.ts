import { describe, expect, it } from 'vitest';

import {
  PLATFORMS,
  constellationHasOverlap,
  extractGitHubUsername,
  extractLinkedInSlug,
  extractMediumUsername,
  extractSubstackSlug,
  extractYouTubeHandle,
  expandedWidth,
  EXPAND_WIDTH_RATIO,
  layoutConstellation,
} from '@/app/lab/import-constellation/platforms';

describe('import constellation parsers', () => {
  it('extracts GitHub usernames from URLs and bare handles', () => {
    expect(extractGitHubUsername('https://github.com/octocat')).toBe('octocat');
    expect(extractGitHubUsername('@octocat')).toBe('octocat');
    expect(extractGitHubUsername('github.com/octocat')).toBe('octocat');
  });

  it('extracts LinkedIn slugs', () => {
    expect(extractLinkedInSlug('https://www.linkedin.com/in/jane-doe/')).toBe('jane-doe');
    expect(extractLinkedInSlug('linkedin.com/in/jane-doe')).toBe('jane-doe');
  });

  it('extracts Medium usernames', () => {
    expect(extractMediumUsername('https://medium.com/@writer')).toBe('writer');
    expect(extractMediumUsername('@writer')).toBe('writer');
  });

  it('extracts Substack publication slugs', () => {
    expect(extractSubstackSlug('https://notes.substack.com')).toBe('notes');
    expect(extractSubstackSlug('notes.substack.com')).toBe('notes');
  });

  it('extracts YouTube handles', () => {
    expect(extractYouTubeHandle('https://www.youtube.com/@channel')).toBe('channel');
    expect(extractYouTubeHandle('@channel')).toBe('channel');
  });

  it('expands idle squares by the design ratio', () => {
    expect(expandedWidth(100)).toBe(Math.round(100 * EXPAND_WIDTH_RATIO));
  });
});

describe('import constellation layout', () => {
  const canvas = { canvasW: 900, canvasH: 520 };

  it('keeps home positions when nothing is expanded', () => {
    const layout = layoutConstellation(PLATFORMS, { expandedId: null, ...canvas });
    for (const platform of PLATFORMS) {
      expect(layout[platform.id]).toEqual({ x: platform.x, y: platform.y });
    }
  });

  it('does not include a profile photo tile', () => {
    expect(PLATFORMS.some((p) => p.id === ('photo' as never))).toBe(false);
  });

  it('locks the lab-arranged seat map', () => {
    const byId = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
    expect(byId.linkedin).toMatchObject({ x: 50, y: 41.8 });
    expect(byId.github).toMatchObject({ x: 66.9, y: 52 });
    expect(byId.behance).toMatchObject({ x: 80.8, y: 18.7 });
  });

  it('pushes neighbors aside when GitHub expands so tiles do not overlap', () => {
    const home = layoutConstellation(PLATFORMS, { expandedId: null, ...canvas });
    const expanded = layoutConstellation(PLATFORMS, { expandedId: 'github', ...canvas });

    expect(
      constellationHasOverlap(PLATFORMS, expanded, { expandedId: 'github', ...canvas, gutter: 0 })
    ).toBe(false);

    const moved = PLATFORMS.some(
      (p) =>
        p.id !== 'github' &&
        (Math.abs(expanded[p.id].x - home[p.id].x) > 0.4 ||
          Math.abs(expanded[p.id].y - home[p.id].y) > 0.4)
    );
    expect(moved).toBe(true);
  });

  it('clears the expanded tile from neighbors when any platform opens', () => {
    for (const platform of PLATFORMS) {
      const expanded = layoutConstellation(PLATFORMS, {
        expandedId: platform.id,
        ...canvas,
      });
      const active = expanded[platform.id];
      const aw = expandedWidth(platform.size);
      const ah = platform.size;
      for (const other of PLATFORMS) {
        if (other.id === platform.id) continue;
        const point = expanded[other.id];
        const ox =
          aw / 2 +
          other.size / 2 -
          Math.abs((active.x / 100) * canvas.canvasW - (point.x / 100) * canvas.canvasW);
        const oy =
          ah / 2 +
          other.size / 2 -
          Math.abs((active.y / 100) * canvas.canvasH - (point.y / 100) * canvas.canvasH);
        expect(ox <= 0 || oy <= 0, `${platform.id} vs ${other.id}`).toBe(true);
      }
    }
  });

  it('only moves tiles in the collision cascade when Behance expands', () => {
    const home = layoutConstellation(PLATFORMS, { expandedId: null, ...canvas });
    const expanded = layoutConstellation(PLATFORMS, { expandedId: 'behance', ...canvas });

    expect(
      constellationHasOverlap(PLATFORMS, expanded, { expandedId: 'behance', ...canvas, gutter: 0 })
    ).toBe(false);

    // Far SW (Substack) should move less than a near neighbor of Behance
    const nearIds = ['portfolio', 'dribbble', 'leetcode'] as const;
    const nearMoved = Math.max(
      ...nearIds.map(
        (id) =>
          Math.abs(expanded[id].x - home[id].x) + Math.abs(expanded[id].y - home[id].y)
      )
    );
    const farMoved =
      Math.abs(expanded.substack.x - home.substack.x) +
      Math.abs(expanded.substack.y - home.substack.y);
    expect(farMoved).toBeLessThanOrEqual(nearMoved + 0.5);
  });

  it('keeps home seats clear of hard overlaps', () => {
    const home = layoutConstellation(PLATFORMS, { expandedId: null, ...canvas });
    expect(
      constellationHasOverlap(PLATFORMS, home, { expandedId: null, ...canvas, gutter: 10 })
    ).toBe(false);
  });

  it('returns to home seats when expansion clears', () => {
    layoutConstellation(PLATFORMS, { expandedId: 'github', ...canvas });
    const restored = layoutConstellation(PLATFORMS, { expandedId: null, ...canvas });
    for (const platform of PLATFORMS) {
      expect(restored[platform.id]).toEqual({ x: platform.x, y: platform.y });
    }
  });
});
