import { describe, expect, it } from 'vitest';

import {
  BUBBLE_PLATFORMS,
  BUBBLE_SIZE_PX,
  LINK_TILE_PX,
  PHOTO_WALL_GUTTER_PX,
  badgeCornerClass,
  bubbleCornerClass,
  extractGitHubUsername,
  extractLinkedInSlug,
  extractMediumUsername,
  extractSubstackIdentifier,
  getBubbleDimensions,
  getOauthExpandedTilePx,
  identityFromGitHubImport,
  identityFromGoogleImport,
  identityFromLinkHandle,
  identityFromLinkedInImport,
  layoutBubbleField,
  mulberry32,
  nextBubbleStateAfterManage,
  normalizePastedUrl,
  packPhotoWall,
  packedWallHasOverlap,
  packedWallMinGap,
} from './bubble-platforms';

describe('bubble platform helpers', () => {
  it('lays out every platform stably for a given seed', () => {
    const a = layoutBubbleField(BUBBLE_PLATFORMS, 77);
    const b = layoutBubbleField(BUBBLE_PLATFORMS, 77);
    expect(a).toHaveLength(BUBBLE_PLATFORMS.length);
    expect(a.map((p) => p.id).sort()).toEqual(BUBBLE_PLATFORMS.map((p) => p.id).sort());
    expect(a).toEqual(b);
    for (const item of a) {
      expect(item.x).toBeGreaterThan(0);
      expect(item.x).toBeLessThan(100);
      expect(item.y).toBeGreaterThan(0);
      expect(item.y).toBeLessThan(100);
      expect(['tl', 'tr', 'bl', 'br']).toContain(item.badgeCorner);
    }
  });

  it('packs a photo wall with no overlaps and a uniform gutter', () => {
    expect(packedWallHasOverlap(BUBBLE_PLATFORMS, 77)).toBe(false);
    expect(packedWallHasOverlap(BUBBLE_PLATFORMS, 1)).toBe(false);
    expect(packedWallHasOverlap(BUBBLE_PLATFORMS, 99)).toBe(false);
    expect(packedWallMinGap(BUBBLE_PLATFORMS, 77)).toBeGreaterThanOrEqual(PHOTO_WALL_GUTTER_PX);
  });

  it('centers rows and keeps tiles inside the canvas', () => {
    const { tiles, canvasW, canvasH } = packPhotoWall(BUBBLE_PLATFORMS, {
      startWithSquare: true,
    });
    expect(tiles).toHaveLength(BUBBLE_PLATFORMS.length);
    for (const tile of tiles) {
      expect(tile.left).toBeGreaterThanOrEqual(0);
      expect(tile.top).toBeGreaterThanOrEqual(0);
      expect(tile.left + tile.width).toBeLessThanOrEqual(canvasW + 0.01);
      expect(tile.top + tile.height).toBeLessThanOrEqual(canvasH + 0.01);
    }
  });

  it('varies pack lead-in or drift with seed', () => {
    const a = layoutBubbleField(BUBBLE_PLATFORMS, 1);
    const b = layoutBubbleField(BUBBLE_PLATFORMS, 99);
    expect(
      a.some(
        (item, i) =>
          item.x !== b[i].x ||
          item.y !== b[i].y ||
          item.badgeCorner !== b[i].badgeCorner ||
          item.driftDelay !== b[i].driftDelay
      )
    ).toBe(true);
  });

  it('mulberry32 is deterministic', () => {
    const r1 = mulberry32(12);
    const r2 = mulberry32(12);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('keeps OAuth as squares and link platforms as rounded rectangles', () => {
    for (const p of BUBBLE_PLATFORMS) {
      if (p.authMode === 'oauth') {
        expect(p.shape).toBe('square');
        expect(p.placeholder).toBeTruthy();
        const idle = getBubbleDimensions(p);
        const expanded = getOauthExpandedTilePx(p.size);
        expect(idle.width).toBe(idle.height);
        expect(expanded.height).toBe(idle.height);
        expect(expanded.width).toBeGreaterThan(idle.width);
      }
      if (p.authMode === 'link') expect(p.shape).toBe('rect');
    }
  });

  it('makes GitHub and LinkedIn the largest squares; link tiles are fixed rects', () => {
    const github = BUBBLE_PLATFORMS.find((p) => p.id === 'github')!;
    const linkedin = BUBBLE_PLATFORMS.find((p) => p.id === 'linkedin')!;
    const youtube = BUBBLE_PLATFORMS.find((p) => p.id === 'youtube')!;
    const portfolio = BUBBLE_PLATFORMS.find((p) => p.id === 'portfolio')!;
    expect(github.size).toBe('xl');
    expect(linkedin.size).toBe('xl');
    expect(github.shape).toBe('square');
    expect(youtube.shape).toBe('rect');
    expect(portfolio.shape).toBe('rect');
    expect(getBubbleDimensions(youtube)).toEqual(LINK_TILE_PX);
    expect(getBubbleDimensions(portfolio)).toEqual(LINK_TILE_PX);
    expect(BUBBLE_SIZE_PX.xl).toBeGreaterThan(BUBBLE_SIZE_PX.lg);
  });

  it('uses fixed rem corners for rectangles so they read as rounded rects', () => {
    expect(bubbleCornerClass('rect')).toBe('rounded-2xl');
    expect(bubbleCornerClass('square')).toBe('rounded-[28%]');
    expect(LINK_TILE_PX.width).toBeGreaterThan(LINK_TILE_PX.height * 1.8);
  });

  it('includes a portfolio link platform', () => {
    expect(BUBBLE_PLATFORMS.some((p) => p.id === 'portfolio')).toBe(true);
  });

  it('maps badge corners to absolute inset classes', () => {
    expect(badgeCornerClass('tl')).toContain('left-1.5');
    expect(badgeCornerClass('tl')).toContain('top-1.5');
    expect(badgeCornerClass('br')).toContain('right-1.5');
    expect(badgeCornerClass('br')).toContain('bottom-1.5');
  });

  it('extracts GitHub identity as username + avatar, not project dump', () => {
    const identity = identityFromGitHubImport({
      githubProfile: {
        username: 'octocat',
        avatarUrl: 'https://avatars.example/octocat.png',
        bio: 'Hello',
      },
      projects: [{ name: 'repo-1' }, { name: 'repo-2' }],
      summary: { projects: 40 },
    });
    expect(identity).toEqual({
      displayName: '@octocat',
      avatarUrl: 'https://avatars.example/octocat.png',
      secondary: 'Hello',
    });
  });

  it('extracts LinkedIn and Google identity from OAuth payloads', () => {
    expect(
      identityFromLinkedInImport({
        fromLinkedIn: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          avatarUrl: 'https://img/ada.png',
        },
      })
    ).toEqual({
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://img/ada.png',
    });

    expect(
      identityFromGoogleImport({
        fromGoogle: {
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@example.com',
          avatarUrl: 'https://img/grace.png',
        },
      })
    ).toEqual({
      displayName: 'Grace Hopper',
      avatarUrl: 'https://img/grace.png',
      secondary: 'grace@example.com',
    });
  });

  it('builds short link identities including portfolio', () => {
    expect(
      identityFromLinkHandle('youtube', '@mkbhd', {
        youtubeVideos: [{ channelTitle: 'Marques Brownlee' }],
      }).displayName
    ).toBe('Marques Brownlee');
    expect(identityFromLinkHandle('medium', 'writer').displayName).toBe('@writer');
    expect(identityFromLinkHandle('substack', 'newsletter').displayName).toBe('@newsletter');
    expect(identityFromLinkHandle('links', 'https://www.example.com/path').displayName).toBe(
      'example.com'
    );
    expect(identityFromLinkHandle('portfolio', 'https://ada.dev').displayName).toBe('ada.dev');
  });

  it('normalizes Medium, Substack, GitHub, and LinkedIn inputs', () => {
    expect(extractMediumUsername('https://medium.com/@jane/article')).toBe('jane');
    expect(extractSubstackIdentifier('https://jane.substack.com/p/hello')).toBe('jane');
    expect(extractGitHubUsername('https://github.com/octocat')).toBe('octocat');
    expect(extractGitHubUsername('@octocat')).toBe('octocat');
    expect(extractLinkedInSlug('https://www.linkedin.com/in/ada-lovelace')).toBe('ada-lovelace');
    expect(normalizePastedUrl('linkedin.com/in/ada')).toBe('https://linkedin.com/in/ada');
  });

  it('includes OAuth platforms for GitHub, LinkedIn, and Google', () => {
    const oauth = BUBBLE_PLATFORMS.filter((p) => p.authMode === 'oauth').map((p) => p.id);
    expect(oauth).toEqual(['github', 'linkedin', 'google']);
  });

  it('resets bubble state for Change vs Remove', () => {
    expect(nextBubbleStateAfterManage('oauth', 'remove', '')).toEqual({
      status: 'idle',
      identity: null,
      input: '',
      keepEditorOpen: false,
      keepInput: false,
    });
    expect(nextBubbleStateAfterManage('link', 'remove', 'https://example.com')).toEqual({
      status: 'idle',
      identity: null,
      input: '',
      keepEditorOpen: false,
      keepInput: false,
    });
    expect(nextBubbleStateAfterManage('oauth', 'change', '')).toEqual({
      status: 'idle',
      identity: null,
      input: '',
      keepEditorOpen: true,
      keepInput: false,
    });
    expect(nextBubbleStateAfterManage('link', 'change', '@channel')).toEqual({
      status: 'idle',
      identity: null,
      input: '@channel',
      keepEditorOpen: true,
      keepInput: true,
    });
  });
});
