/**
 * Import constellation — platform catalog, layout, and preview helpers.
 * Shared by onboarding Step 3 and /lab/import-constellation.
 */

export type PlatformField =
  | 'career'
  | 'engineering'
  | 'writing'
  | 'design'
  | 'creator'
  | 'knowledge'
  | 'product'
  | 'learning'
  | 'research';

export type PlatformId =
  | 'linkedin'
  | 'github'
  | 'notion'
  | 'medium'
  | 'behance'
  | 'figma'
  | 'dribbble'
  | 'youtube'
  | 'huggingface'
  | 'substack'
  | 'flutter'
  | 'instagram'
  | 'leetcode'
  | 'kaggle'
  | 'devpost'
  | 'coursera'
  | 'scholar'
  | 'portfolio';

export type BadgeCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface PlatformDef {
  id: PlatformId;
  label: string;
  field: PlatformField;
  fieldLabel: string;
  brand: string;
  /** Soft tile wash */
  tint: string;
  placeholder: string;
  hint: string;
  /** Idle square edge in px (desktop design stage) */
  size: number;
  /** Center position as % of constellation field */
  x: number;
  y: number;
  /** Subtle float phase */
  driftDelay: number;
  driftDuration: number;
  badgeCorner: BadgeCorner;
  /** How to interpret pasted input */
  inputKind: 'username' | 'url' | 'either';
  /**
   * OAuth platforms expand taller/wider with Connect + paste-link.
   * Link-only platforms keep the compact single-row editor.
   */
  authMode?: 'oauth' | 'link';
  /** Clerk strategy when authMode is oauth */
  oauthStrategy?: 'oauth_github' | 'oauth_linkedin_oidc';
}

/** Shared edge for LinkedIn, GitHub, and Portfolio heroes. */
export const HERO_TILE_SIZE = 120;

/**
 * Curated constellation — LinkedIn / GitHub as equal heroes.
 * Final seats locked from lab arrange.
 */
export const PLATFORMS: PlatformDef[] = [
  // ── NW ────────────────────────────────────────────────────────────
  {
    id: 'linkedin',
    label: 'LinkedIn',
    field: 'career',
    fieldLabel: 'Career',
    brand: '#0A66C2',
    tint: '210 55% 94%',
    placeholder: 'linkedin.com/in/you',
    hint: 'Paste your profile URL',
    size: HERO_TILE_SIZE,
    x: 50,
    y: 41.8,
    driftDelay: 0.2,
    driftDuration: 9.2,
    badgeCorner: 'br',
    inputKind: 'either',
    authMode: 'oauth',
    oauthStrategy: 'oauth_linkedin_oidc',
  },
  {
    id: 'notion',
    label: 'Notion',
    field: 'knowledge',
    fieldLabel: 'Knowledge',
    brand: '#1A1A1A',
    tint: '40 12% 94%',
    placeholder: 'notion.site/… or workspace URL',
    hint: 'Public page or site URL',
    size: 86,
    x: 29.5,
    y: 15.2,
    driftDelay: 1.4,
    driftDuration: 10.1,
    badgeCorner: 'bl',
    inputKind: 'url',
  },
  {
    id: 'kaggle',
    label: 'Kaggle',
    field: 'engineering',
    fieldLabel: 'Data science',
    brand: '#20BEFF',
    tint: '196 85% 93%',
    placeholder: 'kaggle.com/you',
    hint: 'Competitions & notebooks profile',
    size: 78,
    x: 15.7,
    y: 24.8,
    driftDelay: 1.0,
    driftDuration: 8.7,
    badgeCorner: 'tr',
    inputKind: 'either',
  },
  {
    id: 'behance',
    label: 'Behance',
    field: 'design',
    fieldLabel: 'Design',
    brand: '#1769FF',
    tint: '220 70% 94%',
    placeholder: 'behance.net/you',
    hint: 'Portfolio profile URL',
    size: 74,
    x: 80.8,
    y: 18.7,
    driftDelay: 1.1,
    driftDuration: 8.8,
    badgeCorner: 'tr',
    inputKind: 'either',
  },

  // ── NE ────────────────────────────────────────────────────────────
  {
    id: 'github',
    label: 'GitHub',
    field: 'engineering',
    fieldLabel: 'Engineering',
    brand: '#24292F',
    tint: '220 14% 93%',
    placeholder: 'github.com/you',
    hint: 'Username or profile URL',
    size: HERO_TILE_SIZE,
    x: 66.9,
    y: 52,
    driftDelay: 0.8,
    driftDuration: 8.4,
    badgeCorner: 'br',
    inputKind: 'either',
    authMode: 'oauth',
    oauthStrategy: 'oauth_github',
  },
  {
    id: 'leetcode',
    label: 'LeetCode',
    field: 'engineering',
    fieldLabel: 'Interview prep',
    brand: '#FFA116',
    tint: '36 90% 94%',
    placeholder: 'leetcode.com/u/you',
    hint: 'Profile URL or username',
    size: 88,
    x: 44.1,
    y: 10.2,
    driftDelay: 0.4,
    driftDuration: 9.0,
    badgeCorner: 'bl',
    inputKind: 'either',
  },
  {
    id: 'medium',
    label: 'Medium',
    field: 'writing',
    fieldLabel: 'Writing',
    brand: '#1A8917',
    tint: '145 28% 93%',
    placeholder: '@username or medium.com/@you',
    hint: 'Writer handle or profile URL',
    size: 86,
    x: 45,
    y: 68.5,
    driftDelay: 0.5,
    driftDuration: 9.6,
    badgeCorner: 'bl',
    inputKind: 'either',
  },
  {
    id: 'dribbble',
    label: 'Dribbble',
    field: 'design',
    fieldLabel: 'Design',
    brand: '#EA4C89',
    tint: '330 70% 95%',
    placeholder: 'dribbble.com/you',
    hint: 'Shots profile URL',
    size: 74,
    x: 81.2,
    y: 41.3,
    driftDelay: 1.7,
    driftDuration: 8.6,
    badgeCorner: 'tl',
    inputKind: 'either',
  },

  // ── Center ────────────────────────────────────────────────────────
  {
    id: 'flutter',
    label: 'Flutter',
    field: 'engineering',
    fieldLabel: 'Mobile',
    brand: '#02569B',
    tint: '200 70% 94%',
    placeholder: 'pub.dev/publishers/… or GitHub org',
    hint: 'pub.dev publisher or profile URL',
    size: 70,
    x: 35.3,
    y: 91.4,
    driftDelay: 1.5,
    driftDuration: 10.2,
    badgeCorner: 'tl',
    inputKind: 'either',
  },

  // ── SW ────────────────────────────────────────────────────────────
  {
    id: 'portfolio',
    label: 'Portfolio',
    field: 'career',
    fieldLabel: 'Personal site',
    brand: '#0F766E',
    tint: '174 45% 93%',
    placeholder: 'yoursite.com',
    hint: 'Personal site or portfolio URL',
    size: HERO_TILE_SIZE,
    x: 64.5,
    y: 17.5,
    driftDelay: 0.6,
    driftDuration: 8.9,
    badgeCorner: 'tl',
    inputKind: 'url',
  },
  {
    id: 'figma',
    label: 'Figma',
    field: 'design',
    fieldLabel: 'Design',
    brand: '#F24E1E',
    tint: '12 80% 95%',
    placeholder: 'figma.com/@you',
    hint: 'Community profile or file URL',
    size: 82,
    x: 29,
    y: 68.8,
    driftDelay: 0.3,
    driftDuration: 9.8,
    badgeCorner: 'tr',
    inputKind: 'either',
  },
  {
    id: 'coursera',
    label: 'Coursera',
    field: 'learning',
    fieldLabel: 'Courses',
    brand: '#0056D2',
    tint: '214 75% 94%',
    placeholder: 'coursera.org/user/…',
    hint: 'Learner profile or certificate URL',
    size: 80,
    x: 16,
    y: 48.9,
    driftDelay: 1.2,
    driftDuration: 9.5,
    badgeCorner: 'tr',
    inputKind: 'url',
  },
  {
    id: 'substack',
    label: 'Substack',
    field: 'writing',
    fieldLabel: 'Writing',
    brand: '#FF6719',
    tint: '20 82% 94%',
    placeholder: 'you.substack.com',
    hint: 'Publication URL',
    size: 70,
    x: 17.6,
    y: 84.6,
    driftDelay: 0.55,
    driftDuration: 8.9,
    badgeCorner: 'tr',
    inputKind: 'url',
  },

  // ── SE ────────────────────────────────────────────────────────────
  {
    id: 'devpost',
    label: 'Devpost',
    field: 'product',
    fieldLabel: 'Hackathons',
    brand: '#003E54',
    tint: '195 55% 93%',
    placeholder: 'devpost.com/you',
    hint: 'Hackathon portfolio URL',
    size: 88,
    x: 32.3,
    y: 42,
    driftDelay: 0.7,
    driftDuration: 9.3,
    badgeCorner: 'tl',
    inputKind: 'either',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    field: 'creator',
    fieldLabel: 'Creator',
    brand: '#FF0000',
    tint: '0 70% 95%',
    placeholder: '@channel or youtube.com/@you',
    hint: 'Channel handle or URL',
    size: 86,
    x: 71.6,
    y: 87.9,
    driftDelay: 0.9,
    driftDuration: 10.4,
    badgeCorner: 'tl',
    inputKind: 'either',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    field: 'engineering',
    fieldLabel: 'ML / AI',
    brand: '#FFD21E',
    tint: '48 80% 93%',
    placeholder: 'huggingface.co/you',
    hint: 'Profile or org URL',
    size: 74,
    x: 6.8,
    y: 69.1,
    driftDelay: 1.3,
    driftDuration: 9.1,
    badgeCorner: 'tr',
    inputKind: 'either',
  },
  {
    id: 'scholar',
    label: 'Scholar',
    field: 'research',
    fieldLabel: 'Research',
    brand: '#4285F4',
    tint: '214 70% 94%',
    placeholder: 'scholar.google.com/citations?user=…',
    hint: 'Google Scholar profile URL',
    size: 72,
    x: 56.8,
    y: 80.2,
    driftDelay: 1.5,
    driftDuration: 10.0,
    badgeCorner: 'tl',
    inputKind: 'url',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    field: 'creator',
    fieldLabel: 'Creative',
    brand: '#E1306C',
    tint: '330 55% 95%',
    placeholder: 'instagram.com/you',
    hint: 'Handle or profile URL',
    size: 72,
    x: 83.9,
    y: 67.2,
    driftDelay: 1.0,
    driftDuration: 9.4,
    badgeCorner: 'tl',
    inputKind: 'either',
  },
];

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<
  PlatformId,
  PlatformDef
>;

/** Expanded editor width relative to idle square (link-only platforms). */
export const EXPAND_WIDTH_RATIO = 2.2;

/**
 * GitHub / LinkedIn editor — wider + taller for Connect OAuth + paste link.
 * Neighbor collision uses these extents so the parting logic stays correct.
 */
export const OAUTH_EXPAND_WIDTH_RATIO = 2.75;
export const OAUTH_EXPAND_HEIGHT_RATIO = 1.78;

/**
 * Visual scale for connected tiles (layout still uses idle `size` so expand /
 * neighbor parting stays stable).
 */
export const CONNECTED_SCALE = 1.1;

/** Brand badge diameter relative to the idle square edge. */
export const CONNECTED_BADGE_RATIO = 0.2;

const BADGE_CORNERS: BadgeCorner[] = ['tl', 'tr', 'bl', 'br'];

export function randomBadgeCorner(): BadgeCorner {
  return BADGE_CORNERS[Math.floor(Math.random() * BADGE_CORNERS.length)]!;
}

export function platformUsesOAuth(platform: PlatformDef): boolean {
  return platform.authMode === 'oauth';
}

export function expandedWidth(platformOrSize: PlatformDef | number): number {
  if (typeof platformOrSize === 'number') {
    return Math.round(platformOrSize * EXPAND_WIDTH_RATIO);
  }
  const ratio = platformUsesOAuth(platformOrSize) ? OAUTH_EXPAND_WIDTH_RATIO : EXPAND_WIDTH_RATIO;
  return Math.round(platformOrSize.size * ratio);
}

export function expandedHeight(platform: PlatformDef): number {
  if (platformUsesOAuth(platform)) {
    return Math.round(platform.size * OAUTH_EXPAND_HEIGHT_RATIO);
  }
  return platform.size;
}

/**
 * Shift seats so the cloud's visual bounding box is centered horizontally
 * in the field — equal gap from leftmost bubble edge to left wall and
 * rightmost bubble edge to right wall.
 */
export function centerConstellationHorizontally(
  platforms: PlatformDef[],
  canvasW: number
): PlatformDef[] {
  if (canvasW <= 0 || platforms.length === 0) return platforms;

  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const p of platforms) {
    const halfPct = (p.size / 2 / canvasW) * 100;
    minLeft = Math.min(minLeft, p.x - halfPct);
    maxRight = Math.max(maxRight, p.x + halfPct);
  }

  const shiftX = 50 - (minLeft + maxRight) / 2;
  if (!Number.isFinite(shiftX) || Math.abs(shiftX) < 0.01) return platforms;

  return platforms.map((p) => ({ ...p, x: p.x + shiftX }));
}

/**
 * Shared choreography for expand ↔ collapse.
 * Same curve on width + every neighbor so the field moves in tandem.
 */
export const CONSTELLATION_EASE = [0.22, 1, 0.36, 1] as const;
export const CONSTELLATION_DURATION = 0.62;

/** Center position as % of the constellation stage. */
export interface LayoutPoint {
  x: number;
  y: number;
}

const LAYOUT_MARGIN_PX = 14;
const LAYOUT_GUTTER_PX = 14;
const LAYOUT_ITERATIONS = 48;

type SimTile = {
  id: PlatformId;
  cx: number;
  cy: number;
  w: number;
  h: number;
  fixed: boolean;
};

function tileHalfExtents(tile: SimTile) {
  return { hw: tile.w / 2, hh: tile.h / 2 };
}

/**
 * Minimum translation vector (MTV) that clears AABB overlap between `a` and `b`.
 * Returns the displacement to apply to `a` (so `-mtv` would apply to `b`).
 *
 * Prefers the shallowest axis, but switches when that axis has no room to move
 * (wall-pinned) so dense fields don't get stuck with hairline overlaps.
 */
function separationNeeded(
  a: SimTile,
  b: SimTile,
  gutter: number,
  canvasW?: number,
  canvasH?: number,
  margin = LAYOUT_MARGIN_PX
): { dx: number; dy: number } | null {
  const { hw: ahw, hh: ahh } = tileHalfExtents(a);
  const { hw: bhw, hh: bhh } = tileHalfExtents(b);
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  const overlapX = ahw + bhw + gutter - Math.abs(dx);
  const overlapY = ahh + bhh + gutter - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;

  const signX = dx === 0 ? 1 : Math.sign(dx);
  const signY = dy === 0 ? 1 : Math.sign(dy);
  const horizontal = { dx: signX * overlapX, dy: 0 };
  const vertical = { dx: 0, dy: signY * overlapY };

  if (canvasW == null || canvasH == null) {
    return overlapX < overlapY ? horizontal : vertical;
  }

  const roomX = signX > 0 ? canvasW - margin - ahw - a.cx : a.cx - (margin + ahw);
  const roomY = signY > 0 ? canvasH - margin - ahh - a.cy : a.cy - (margin + ahh);

  const preferHorizontal = overlapX < overlapY;
  if (preferHorizontal) {
    if (roomX >= overlapX * 0.5) return horizontal;
    if (roomY >= overlapY * 0.5) return vertical;
    return horizontal;
  }
  if (roomY >= overlapY * 0.5) return vertical;
  if (roomX >= overlapX * 0.5) return horizontal;
  return vertical;
}

function clampTile(tile: SimTile, canvasW: number, canvasH: number, margin: number) {
  const { hw, hh } = tileHalfExtents(tile);
  tile.cx = Math.min(canvasW - margin - hw, Math.max(margin + hw, tile.cx));
  tile.cy = Math.min(canvasH - margin - hh, Math.max(margin + hh, tile.cy));
}

/**
 * Resolve constellation positions so an expanded editor doesn't cover neighbors.
 *
 * Clearance rules (deterministic):
 * 1. Expanded tile stays near its home seat, with a light pull toward center
 *    so edge expands have room to breathe.
 * 2. Neighbors take most of the MTV; the editor yields a little when a neighbor
 *    is pinned against the stage edge.
 * 3. Moved tiles then clear overlaps with each other (50/50 MTV).
 * 4. Iterate until settled. Distant tiles that aren't in the collision chain
 *    stay put.
 */
export function layoutConstellation(
  platforms: PlatformDef[],
  options: {
    expandedId: PlatformId | null;
    canvasW: number;
    canvasH: number;
    gutter?: number;
    margin?: number;
  }
): Record<PlatformId, LayoutPoint> {
  const canvasW = Math.max(options.canvasW, 1);
  const canvasH = Math.max(options.canvasH, 1);
  const gutter = options.gutter ?? LAYOUT_GUTTER_PX;
  const margin = options.margin ?? LAYOUT_MARGIN_PX;
  const expandedId = options.expandedId;

  const tiles: SimTile[] = platforms.map((p) => {
    const expanding = expandedId === p.id;
    return {
      id: p.id,
      cx: (p.x / 100) * canvasW,
      cy: (p.y / 100) * canvasH,
      w: expanding ? expandedWidth(p) : p.size,
      h: expanding ? expandedHeight(p) : p.size,
      fixed: expanding,
    };
  });

  if (!expandedId) {
    return Object.fromEntries(platforms.map((p) => [p.id, { x: p.x, y: p.y }])) as Record<
      PlatformId,
      LayoutPoint
    >;
  }

  const active = tiles.find((t) => t.id === expandedId);
  if (!active) {
    return Object.fromEntries(platforms.map((p) => [p.id, { x: p.x, y: p.y }])) as Record<
      PlatformId,
      LayoutPoint
    >;
  }

  // Dense organic seats need a little center room when the editor grows wide
  active.cx += (canvasW / 2 - active.cx) * 0.12;
  active.cy += (canvasH / 2 - active.cy) * 0.08;
  clampTile(active, canvasW, canvasH, margin);

  for (let iter = 0; iter < LAYOUT_ITERATIONS; iter++) {
    // Phase 1 — push neighbors fully off the editor
    for (const tile of tiles) {
      if (tile.fixed) continue;
      const push = separationNeeded(tile, active, gutter, canvasW, canvasH, margin);
      if (!push) continue;
      tile.cx += push.dx;
      tile.cy += push.dy;
    }

    for (const tile of tiles) {
      if (!tile.fixed) clampTile(tile, canvasW, canvasH, margin);
    }

    // Phase 2 — if a neighbor is wall-pinned, editor yields the remainder
    for (const tile of tiles) {
      if (tile.fixed) continue;
      const push = separationNeeded(tile, active, gutter, canvasW, canvasH, margin);
      if (!push) continue;
      tile.cx += push.dx * 0.55;
      tile.cy += push.dy * 0.55;
      active.cx -= push.dx * 0.45;
      active.cy -= push.dy * 0.45;
    }

    // Phase 3 — neighbor vs neighbor
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i];
        const b = tiles[j];
        if (a.fixed || b.fixed) continue;
        const sep = separationNeeded(a, b, gutter, canvasW, canvasH, margin);
        if (!sep) continue;
        a.cx += sep.dx / 2;
        a.cy += sep.dy / 2;
        b.cx -= sep.dx / 2;
        b.cy -= sep.dy / 2;
      }
    }

    for (const tile of tiles) {
      clampTile(tile, canvasW, canvasH, margin);
    }
  }

  // Final polish — clear any leftover editor overlaps, then settle neighbors once
  for (let polish = 0; polish < 8; polish++) {
    for (const tile of tiles) {
      if (tile.fixed) continue;
      const push = separationNeeded(tile, active, gutter, canvasW, canvasH, margin);
      if (!push) continue;
      tile.cx += push.dx;
      tile.cy += push.dy;
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i];
        const b = tiles[j];
        if (a.fixed && b.fixed) continue;
        const sep = separationNeeded(a, b, gutter, canvasW, canvasH, margin);
        if (!sep) continue;
        if (a.fixed) {
          b.cx -= sep.dx;
          b.cy -= sep.dy;
        } else if (b.fixed) {
          a.cx += sep.dx;
          a.cy += sep.dy;
        } else {
          a.cx += sep.dx / 2;
          a.cy += sep.dy / 2;
          b.cx -= sep.dx / 2;
          b.cy -= sep.dy / 2;
        }
      }
    }
    for (const tile of tiles) {
      clampTile(tile, canvasW, canvasH, margin);
    }
  }

  return Object.fromEntries(
    tiles.map((t) => [
      t.id,
      {
        x: (t.cx / canvasW) * 100,
        y: (t.cy / canvasH) * 100,
      },
    ])
  ) as Record<PlatformId, LayoutPoint>;
}

/** Motion delay so nearer marks lead the parting — still one shared curve. */
export function constellationNeighborDelay(
  platform: PlatformDef,
  expanded: PlatformDef | null,
  canvasW: number,
  canvasH: number
): number {
  if (!expanded || platform.id === expanded.id) return 0;
  const ax = (expanded.x / 100) * canvasW;
  const ay = (expanded.y / 100) * canvasH;
  const bx = (platform.x / 100) * canvasW;
  const by = (platform.y / 100) * canvasH;
  const dist = Math.hypot(ax - bx, ay - by);
  return Math.min(0.1, dist / 2200);
}

/** True when two layout rects would overlap (for tests). */
export function constellationHasOverlap(
  platforms: PlatformDef[],
  layout: Record<PlatformId, LayoutPoint>,
  options: {
    expandedId: PlatformId | null;
    canvasW: number;
    canvasH: number;
    gutter?: number;
  }
): boolean {
  const gutter = options.gutter ?? LAYOUT_GUTTER_PX;
  const tiles: SimTile[] = platforms.map((p) => {
    const expanding = options.expandedId === p.id;
    const point = layout[p.id];
    return {
      id: p.id,
      cx: (point.x / 100) * options.canvasW,
      cy: (point.y / 100) * options.canvasH,
      w: expanding ? expandedWidth(p) : p.size,
      h: expanding ? expandedHeight(p) : p.size,
      fixed: expanding,
    };
  });

  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (separationNeeded(tiles[i], tiles[j], gutter)) return true;
    }
  }
  return false;
}

export function hexToRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const int = parseInt(value, 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/** Tailwind offsets for a light inset badge (legacy / confirm chip). */
export function badgeCornerClass(corner: BadgeCorner): string {
  switch (corner) {
    case 'tl':
      return '-left-1.5 -top-1.5';
    case 'tr':
      return '-right-1.5 -top-1.5';
    case 'bl':
      return '-bottom-1.5 -left-1.5';
    case 'br':
      return '-bottom-1.5 -right-1.5';
  }
}

/**
 * Absolute offsets so a circular badge straddles a square tile corner like a
 * Venn overlap — ~50% inside the square, ~50% outside.
 */
export function vennBadgeStyle(
  corner: BadgeCorner,
  badgePx: number
): { top?: number; right?: number; bottom?: number; left?: number } {
  const half = -Math.round(badgePx / 2);
  switch (corner) {
    case 'tl':
      return { left: half, top: half };
    case 'tr':
      return { right: half, top: half };
    case 'bl':
      return { left: half, bottom: half };
    case 'br':
      return { right: half, bottom: half };
  }
}

export interface PreviewIdentity {
  displayName: string;
  handle: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  essentials: string[];
  sourceUrl?: string;
}

function ensureUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') || trimmed.includes('/')) return `https://${trimmed}`;
  return trimmed;
}

export function extractGitHubUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('github.com')) {
      const part = url.pathname.split('/').filter(Boolean)[0];
      return (part ?? '').replace(/^@/, '');
    }
  } catch {
    // bare username
  }
  return trimmed.replace(/^@/, '').replace(/^github\.com\//i, '');
}

export function extractLinkedInSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('linkedin.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const inIdx = parts.findIndex((p) => p === 'in' || p === 'pub');
      if (inIdx >= 0 && parts[inIdx + 1]) return parts[inIdx + 1];
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '').replace(/^linkedin\.com\/in\//i, '');
}

export function extractMediumUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('medium.com')) {
      const part = url.pathname.split('/').filter(Boolean)[0];
      return (part ?? '').replace(/^@/, '');
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '');
}

export function extractHandleFromHostPath(
  input: string,
  hostIncludes: string,
  pathIndex = 0
): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes(hostIncludes)) {
      const part = url.pathname.split('/').filter(Boolean)[pathIndex];
      return (part ?? '').replace(/^@/, '');
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '').replace(new RegExp(`^${hostIncludes}/`, 'i'), '');
}

export function extractSubstackSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('substack.com')) {
      const sub = url.hostname.split('.')[0];
      if (sub && sub !== 'www' && sub !== 'substack') return sub;
    }
  } catch {
    // fall through
  }
  const match = trimmed.match(/^([\w-]+)\.substack\.com/i);
  if (match) return match[1];
  return trimmed.replace(/^@/, '');
}

export function extractYouTubeHandle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0]?.startsWith('@')) return parts[0].slice(1);
      if (parts[0] === 'c' || parts[0] === 'channel' || parts[0] === 'user') {
        return parts[1] ?? '';
      }
      return (parts[0] ?? '').replace(/^@/, '');
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '');
}

function displayFromSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Lab preview — fetches real essentials where public APIs allow it;
 * otherwise confirms the parsed identity from the pasted link.
 * Avatar URLs are only set when a real photo is available (e.g. GitHub).
 * Otherwise the UI renders brand-tinted initials.
 */
export async function previewPlatformIdentity(
  platform: PlatformDef,
  rawInput: string
): Promise<PreviewIdentity> {
  const input = rawInput.trim();
  if (!input) throw new Error('Add a username or link first');

  switch (platform.id) {
    case 'github': {
      const username = extractGitHubUsername(input);
      if (!username) throw new Error('Enter a GitHub username or profile URL');
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.status === 404) throw new Error('GitHub user not found');
      if (!res.ok) throw new Error('Could not reach GitHub right now');
      const data = (await res.json()) as {
        login?: string;
        name?: string | null;
        avatar_url?: string;
        bio?: string | null;
        public_repos?: number;
        followers?: number;
        company?: string | null;
        location?: string | null;
        html_url?: string;
      };
      const handle = data.login || username;
      const essentials = [
        data.public_repos != null ? `${data.public_repos} repos` : null,
        data.followers != null ? `${data.followers} followers` : null,
        data.location || null,
        data.company || null,
      ].filter(Boolean) as string[];
      return {
        displayName: data.name || `@${handle}`,
        handle: `@${handle}`,
        avatarUrl: data.avatar_url,
        secondary: data.bio,
        essentials,
        sourceUrl: data.html_url || `https://github.com/${handle}`,
      };
    }

    case 'linkedin': {
      const slug = extractLinkedInSlug(input);
      if (!slug) throw new Error('Paste a LinkedIn profile URL');
      return {
        displayName: displayFromSlug(slug),
        handle: `linkedin.com/in/${slug}`,
        secondary: 'Profile link confirmed — connect later for full import',
        essentials: ['Headline & experience', 'Education', 'Skills'],
        sourceUrl: `https://www.linkedin.com/in/${slug}`,
      };
    }

    case 'medium': {
      const username = extractMediumUsername(input);
      if (!username) throw new Error('Enter a Medium username or URL');
      return {
        displayName: `@${username}`,
        handle: `medium.com/@${username}`,
        secondary: 'Writing profile ready to attach',
        essentials: ['Stories', 'About', 'Publications'],
        sourceUrl: `https://medium.com/@${username}`,
      };
    }

    case 'notion': {
      const url = ensureUrl(input);
      try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
      } catch {
        throw new Error('Paste a public Notion page or site URL');
      }
      let host = 'notion';
      try {
        host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(
          /^www\./,
          ''
        );
      } catch {
        // keep default
      }
      return {
        displayName: host,
        handle: host,
        secondary: 'Public page linked',
        essentials: ['Page title', 'Shared workspace'],
        sourceUrl: url.startsWith('http') ? url : `https://${url}`,
      };
    }

    case 'behance': {
      const handle = extractHandleFromHostPath(input, 'behance.net') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste a Behance profile URL');
      return {
        displayName: handle,
        handle: `behance.net/${handle}`,
        secondary: 'Design portfolio linked',
        essentials: ['Projects', 'Appreciations', 'About'],
        sourceUrl: `https://www.behance.net/${handle}`,
      };
    }

    case 'figma': {
      const fromAt = extractHandleFromHostPath(input, 'figma.com');
      const cleaned = (fromAt || input).replace(/^@/, '').trim() || 'figma';
      return {
        displayName: `@${cleaned}`,
        handle: `figma.com/@${cleaned}`,
        secondary: 'Design presence linked',
        essentials: ['Community profile', 'Public files'],
        sourceUrl: `https://www.figma.com/@${cleaned}`,
      };
    }

    case 'dribbble': {
      const handle = extractHandleFromHostPath(input, 'dribbble.com') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste a Dribbble profile URL');
      return {
        displayName: handle,
        handle: `dribbble.com/${handle}`,
        secondary: 'Shots profile linked',
        essentials: ['Shots', 'Collections', 'About'],
        sourceUrl: `https://dribbble.com/${handle}`,
      };
    }

    case 'youtube': {
      const handle = extractYouTubeHandle(input);
      if (!handle) throw new Error('Enter a YouTube channel handle or URL');
      return {
        displayName: handle.startsWith('@') ? handle : `@${handle}`,
        handle: `youtube.com/@${handle.replace(/^@/, '')}`,
        secondary: 'Channel linked',
        essentials: ['Channel name', 'Videos', 'About'],
        sourceUrl: `https://www.youtube.com/@${handle.replace(/^@/, '')}`,
      };
    }

    case 'huggingface': {
      const handle = extractHandleFromHostPath(input, 'huggingface.co') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste a Hugging Face profile URL');
      return {
        displayName: handle,
        handle: `huggingface.co/${handle}`,
        secondary: 'ML profile linked',
        essentials: ['Models', 'Datasets', 'Spaces'],
        sourceUrl: `https://huggingface.co/${handle}`,
      };
    }

    case 'substack': {
      const slug = extractSubstackSlug(input);
      if (!slug) throw new Error('Paste your publication URL');
      return {
        displayName: slug,
        handle: `${slug}.substack.com`,
        secondary: 'Publication linked',
        essentials: ['About', 'Posts', 'Subscribe'],
        sourceUrl: `https://${slug}.substack.com`,
      };
    }

    case 'flutter': {
      const url = ensureUrl(input);
      let handle = input.replace(/^@/, '').trim();
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        if (parsed.hostname.includes('pub.dev')) {
          const parts = parsed.pathname.split('/').filter(Boolean);
          const pubIdx = parts.findIndex((p) => p === 'publishers' || p === 'packages');
          handle = pubIdx >= 0 && parts[pubIdx + 1] ? parts[pubIdx + 1] : parts[0] || handle;
        } else if (parsed.hostname.includes('github.com')) {
          handle = partsOrFirst(parsed) || handle;
        }
      } catch {
        // bare handle
      }
      if (!handle) throw new Error('Paste a pub.dev or Flutter profile URL');
      return {
        displayName: handle,
        handle: handle.includes('.') ? handle : `pub.dev · ${handle}`,
        secondary: 'Mobile / Dart presence linked',
        essentials: ['Packages', 'Publisher', 'Scores'],
        sourceUrl: url.startsWith('http') ? url : `https://${url}`,
      };
    }

    case 'instagram': {
      const handle = extractHandleFromHostPath(input, 'instagram.com') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste an Instagram profile URL');
      return {
        displayName: `@${handle.replace(/^@/, '')}`,
        handle: `instagram.com/${handle.replace(/^@/, '')}`,
        secondary: 'Creative profile linked',
        essentials: ['Bio', 'Highlights', 'Posts'],
        sourceUrl: `https://www.instagram.com/${handle.replace(/^@/, '')}/`,
      };
    }

    case 'leetcode': {
      let cleaned = '';
      try {
        const url = new URL(input.startsWith('http') ? input : `https://${input}`);
        if (url.hostname.includes('leetcode')) {
          const parts = url.pathname.split('/').filter(Boolean);
          const uIdx = parts.findIndex((p) => p === 'u' || p === 'user');
          cleaned = (uIdx >= 0 ? parts[uIdx + 1] : parts[0]) || '';
        }
      } catch {
        // bare username
      }
      cleaned = (cleaned || input.replace(/^@/, '').replace(/^leetcode\.com\/u\//i, '')).trim();
      if (!cleaned) throw new Error('Paste a LeetCode profile URL or username');
      return {
        displayName: cleaned,
        handle: `leetcode.com/u/${cleaned}`,
        secondary: 'Interview prep profile linked',
        essentials: ['Rating', 'Solved', 'Badges'],
        sourceUrl: `https://leetcode.com/u/${cleaned}/`,
      };
    }

    case 'kaggle': {
      const handle = extractHandleFromHostPath(input, 'kaggle.com') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste a Kaggle profile URL');
      return {
        displayName: handle,
        handle: `kaggle.com/${handle}`,
        secondary: 'Data science profile linked',
        essentials: ['Competitions', 'Notebooks', 'Datasets'],
        sourceUrl: `https://www.kaggle.com/${handle}`,
      };
    }

    case 'devpost': {
      const handle = extractHandleFromHostPath(input, 'devpost.com') || input.replace(/^@/, '');
      if (!handle) throw new Error('Paste a Devpost profile URL');
      return {
        displayName: handle,
        handle: `devpost.com/${handle}`,
        secondary: 'Hackathon portfolio linked',
        essentials: ['Projects', 'Hackathons', 'Awards'],
        sourceUrl: `https://devpost.com/${handle}`,
      };
    }

    case 'coursera': {
      const url = ensureUrl(input);
      if (!url.toLowerCase().includes('coursera')) {
        throw new Error('Paste a Coursera learner or certificate URL');
      }
      let label = 'Coursera learner';
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const userIdx = parts.findIndex((p) => p === 'user' || p === 'account');
        if (userIdx >= 0 && parts[userIdx + 1]) label = parts[userIdx + 1];
        else if (parts.includes('verify') || parts.includes('certificate')) label = 'Certificate';
      } catch {
        // keep default
      }
      return {
        displayName: displayFromSlug(label),
        handle: 'coursera.org',
        secondary: 'Course credentials linked',
        essentials: ['Courses', 'Certificates', 'Specializations'],
        sourceUrl: url.startsWith('http') ? url : `https://${url}`,
      };
    }

    case 'scholar': {
      const url = ensureUrl(input);
      if (!url.toLowerCase().includes('scholar.google')) {
        throw new Error('Paste a Google Scholar citations URL');
      }
      let userId = '';
      try {
        userId =
          new URL(url.startsWith('http') ? url : `https://${url}`).searchParams.get('user') || '';
      } catch {
        throw new Error('Paste a valid Scholar URL');
      }
      return {
        displayName: userId ? `Scholar ${userId.slice(0, 8)}` : 'Google Scholar',
        handle: userId ? `user=${userId}` : 'scholar.google.com',
        secondary: 'Research profile linked',
        essentials: ['Citations', 'h-index', 'Articles'],
        sourceUrl: url.startsWith('http') ? url : `https://${url}`,
      };
    }

    case 'portfolio': {
      const url = ensureUrl(input);
      try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
      } catch {
        throw new Error('Paste your personal site URL');
      }
      let host = url;
      try {
        host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(
          /^www\./,
          ''
        );
      } catch {
        // keep raw
      }
      return {
        displayName: host,
        handle: host,
        secondary: 'Personal site linked',
        essentials: ['About', 'Projects', 'Contact'],
        sourceUrl: url.startsWith('http') ? url : `https://${url}`,
      };
    }
  }
}

function partsOrFirst(parsed: URL): string {
  return parsed.pathname.split('/').filter(Boolean)[0] || '';
}

/** @internal — exported for tests */
export const __test = { ensureUrl, displayFromSlug };
