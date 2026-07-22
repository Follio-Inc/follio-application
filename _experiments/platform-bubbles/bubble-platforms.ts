/**
 * Platform bubble field — layout + identity helpers.
 * Curated constellation layout (no overlap) with fixed tile sizes.
 */

export type BubbleAuthMode = 'oauth' | 'link';
export type BubbleSize = 'sm' | 'md' | 'lg' | 'xl';
/**
 * OAuth platforms are squares in the photo wall (mixed with link rects).
 * They expand to a wider rect only while the Connect / paste editor is open.
 */
export type BubbleShape = 'square' | 'rect';
/** Where the official logo sits once connected (never removed). */
export type BadgeCorner = 'tl' | 'tr' | 'bl' | 'br';

export type BubblePlatformId =
  | 'github'
  | 'linkedin'
  | 'google'
  | 'youtube'
  | 'medium'
  | 'substack'
  | 'portfolio'
  | 'links';

export interface BubblePlatformDef {
  id: BubblePlatformId;
  label: string;
  authMode: BubbleAuthMode;
  /** Clerk OAuth strategy when authMode is oauth */
  oauthStrategy?: 'oauth_github' | 'oauth_linkedin_oidc' | 'oauth_google';
  size: BubbleSize;
  shape: BubbleShape;
  /** Soft tint for idle tile (Tailwind-friendly HSL fragments) */
  tint: string;
  /** Brand accent hex — drives hover glow, rings, and connected accents. */
  brand: string;
  /** Placeholder for link input */
  placeholder?: string;
  /** Hint in the expanded editor */
  hint: string;
}

/** Fixed platform set. Positions are curated separately. */
export const BUBBLE_PLATFORMS: BubblePlatformDef[] = [
  {
    id: 'github',
    label: 'GitHub',
    authMode: 'oauth',
    oauthStrategy: 'oauth_github',
    size: 'xl',
    shape: 'square',
    tint: '220 16% 93%',
    brand: '#24292f',
    placeholder: 'github.com/you',
    hint: 'Connect or paste a profile',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    authMode: 'oauth',
    oauthStrategy: 'oauth_linkedin_oidc',
    size: 'xl',
    shape: 'square',
    tint: '210 60% 93%',
    brand: '#0a66c2',
    placeholder: 'linkedin.com/in/you',
    hint: 'Connect or paste a profile',
  },
  {
    id: 'google',
    label: 'Google',
    authMode: 'oauth',
    oauthStrategy: 'oauth_google',
    size: 'lg',
    shape: 'square',
    tint: '214 70% 95%',
    brand: '#4285f4',
    placeholder: 'Profile or site URL',
    hint: 'Connect or paste a link',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    authMode: 'link',
    size: 'lg',
    shape: 'rect',
    tint: '0 75% 95%',
    brand: '#ff0000',
    placeholder: '@channel',
    hint: 'Paste your channel',
  },
  {
    id: 'medium',
    label: 'Medium',
    authMode: 'link',
    size: 'md',
    shape: 'rect',
    tint: '145 30% 93%',
    brand: '#1a8917',
    placeholder: '@username',
    hint: 'Paste your username',
  },
  {
    id: 'substack',
    label: 'Substack',
    authMode: 'link',
    size: 'md',
    shape: 'rect',
    tint: '20 85% 94%',
    brand: '#ff6719',
    placeholder: 'yourname.substack.com',
    hint: 'Paste your publication',
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    authMode: 'link',
    size: 'md',
    shape: 'rect',
    tint: '250 45% 95%',
    brand: '#7c3aed',
    placeholder: 'https://…',
    hint: 'Paste your site URL',
  },
  {
    id: 'links',
    label: 'Link',
    authMode: 'link',
    size: 'sm',
    shape: 'rect',
    tint: '235 55% 95%',
    brand: '#4f46e5',
    placeholder: 'https://…',
    hint: 'Paste any URL',
  },
];

/** Convert a #rrggbb hex to an `r, g, b` string for rgba() usage. */
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
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r}, ${g}, ${b}`;
}

/** Square tile edge length by size token. */
export const BUBBLE_SIZE_PX: Record<BubbleSize, number> = {
  sm: 128,
  md: 156,
  lg: 184,
  xl: 220,
};

/**
 * Fixed rounded-rect for link-only platforms.
 * Clearly wider than tall so it reads as a rectangle; idle = editor size.
 */
export const LINK_TILE_PX = { width: 268, height: 124 } as const;

/**
 * Expanded OAuth editor size — same height as the idle square, wider for
 * Connect + paste-link. Used only while the editor is open (layout pack stays square).
 */
export const OAUTH_EXPAND_WIDTH_RATIO = 1.55;

export function getOauthExpandedTilePx(size: BubbleSize): BubbleDimensions {
  const height = BUBBLE_SIZE_PX[size];
  return { width: Math.round(height * OAUTH_EXPAND_WIDTH_RATIO), height };
}

/** @deprecated Prefer getOauthExpandedTilePx */
export const OAUTH_WIDTH_RATIO = OAUTH_EXPAND_WIDTH_RATIO;
export const getOauthTilePx = getOauthExpandedTilePx;

/**
 * Square tiles use a relative squircle corner (matches inner logo wells).
 * Rect tiles use a fixed rem radius so they read as true rectangles with soft corners —
 * percentage radius on a wide tile looks like a capsule / blob, not a rectangle.
 */
export const BUBBLE_CORNER_SQUARE = 'rounded-[28%]';
export const BUBBLE_CORNER_RECT = 'rounded-2xl';

/** @deprecated Prefer shape-specific corners via bubbleCornerClass. */
export const BUBBLE_CORNER = BUBBLE_CORNER_SQUARE;

export function bubbleCornerClass(shape: BubbleShape): string {
  return shape === 'rect' ? BUBBLE_CORNER_RECT : BUBBLE_CORNER_SQUARE;
}

export interface BubbleDimensions {
  width: number;
  height: number;
}

/**
 * Packed / idle tile dimensions.
 * OAuth stays square so the photo-wall mix of squares + link rects is preserved.
 */
export function getBubbleDimensions(platform: BubblePlatformDef): BubbleDimensions {
  if (platform.shape === 'rect') {
    return { width: LINK_TILE_PX.width, height: LINK_TILE_PX.height };
  }
  const edge = BUBBLE_SIZE_PX[platform.size];
  return { width: edge, height: edge };
}

export interface BubbleLayoutItem {
  id: BubblePlatformId;
  /** Percent of canvas width (0–100), center of bubble */
  x: number;
  /** Percent of canvas height (0–100), center of bubble */
  y: number;
  driftDelay: number;
  driftDuration: number;
  /** Corner for the official logo badge after connect */
  badgeCorner: BadgeCorner;
}

const BADGE_CORNERS: BadgeCorner[] = ['tl', 'tr', 'bl', 'br'];

/** Uniform gap between frames — salon / photo-wall rhythm. */
export const PHOTO_WALL_GUTTER_PX = 22;
const PHOTO_WALL_MARGIN_X = 28;
const PHOTO_WALL_MARGIN_TOP = 52; // clears the header pill
const PHOTO_WALL_MARGIN_BOTTOM = 24;
const PHOTO_WALL_CANVAS_W = 900;

/**
 * Seeded PRNG (mulberry32) — same seed → same drift / badge corners / pack variant.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type PackedTile = {
  id: BubblePlatformId;
  left: number;
  top: number;
  width: number;
  height: number;
};

function areaOf(platform: BubblePlatformDef): number {
  const d = getBubbleDimensions(platform);
  return d.width * d.height;
}

/** Alternate squares and rects (largest first in each lane) for a mixed gallery rhythm. */
function interleaveByShape(
  platforms: BubblePlatformDef[],
  startWithSquare: boolean
): BubblePlatformDef[] {
  const byAreaDesc = (a: BubblePlatformDef, b: BubblePlatformDef) => areaOf(b) - areaOf(a);
  const squares = platforms.filter((p) => p.shape === 'square').sort(byAreaDesc);
  const rects = platforms.filter((p) => p.shape === 'rect').sort(byAreaDesc);
  const primary = startWithSquare ? squares : rects;
  const secondary = startWithSquare ? rects : squares;
  const out: BubblePlatformDef[] = [];
  const n = Math.max(primary.length, secondary.length);
  for (let i = 0; i < n; i++) {
    if (i < primary.length) out.push(primary[i]);
    if (i < secondary.length) out.push(secondary[i]);
  }
  return out;
}

/**
 * Photo-wall (salon hang) packer:
 * 1. Interleave squares + rounded-rects by size
 * 2. Shelf-pack into rows with a uniform gutter
 * 3. Center each row, vertically center tiles within the row
 * 4. Center the whole composition on the canvas
 *
 * Guarantees no overlaps when gutter > 0.
 */
export function packPhotoWall(
  platforms: BubblePlatformDef[],
  options?: { startWithSquare?: boolean; canvasW?: number; gutter?: number }
): { tiles: PackedTile[]; canvasW: number; canvasH: number } {
  const canvasW = options?.canvasW ?? PHOTO_WALL_CANVAS_W;
  const gutter = options?.gutter ?? PHOTO_WALL_GUTTER_PX;
  const startWithSquare = options?.startWithSquare ?? true;
  const order = interleaveByShape(platforms, startWithSquare);
  const maxRowW = canvasW - PHOTO_WALL_MARGIN_X * 2;

  type RowItem = { id: BubblePlatformId; width: number; height: number };
  const rows: RowItem[][] = [];
  let current: RowItem[] = [];
  let rowWidth = 0;

  for (const platform of order) {
    const dims = getBubbleDimensions(platform);
    const extra = current.length > 0 ? gutter : 0;
    if (current.length > 0 && rowWidth + extra + dims.width > maxRowW) {
      rows.push(current);
      current = [];
      rowWidth = 0;
    }
    current.push({ id: platform.id, width: dims.width, height: dims.height });
    rowWidth += extra + dims.width;
  }
  if (current.length > 0) rows.push(current);

  const tiles: PackedTile[] = [];
  let y = PHOTO_WALL_MARGIN_TOP;

  for (const row of rows) {
    const rowInnerW = row.reduce((sum, t) => sum + t.width, 0) + gutter * (row.length - 1);
    const rowH = Math.max(...row.map((t) => t.height));
    let x = (canvasW - rowInnerW) / 2;

    for (const item of row) {
      // Center shorter tiles in the shelf — classic framed-photo hang
      const top = y + (rowH - item.height) / 2;
      tiles.push({
        id: item.id,
        left: x,
        top,
        width: item.width,
        height: item.height,
      });
      x += item.width + gutter;
    }
    y += rowH + gutter;
  }

  const packTop = Math.min(...tiles.map((t) => t.top));
  const packBottom = Math.max(...tiles.map((t) => t.top + t.height));
  const packH = packBottom - packTop;
  const canvasH = Math.max(
    packBottom + PHOTO_WALL_MARGIN_BOTTOM,
    PHOTO_WALL_MARGIN_TOP + packH + PHOTO_WALL_MARGIN_BOTTOM,
    480
  );

  // Vertically center the hang within the field (below the header margin)
  const availTop = PHOTO_WALL_MARGIN_TOP;
  const availBottom = canvasH - PHOTO_WALL_MARGIN_BOTTOM;
  const availH = availBottom - availTop;
  const yShift = availTop + (availH - packH) / 2 - packTop;

  for (const tile of tiles) {
    tile.top += yShift;
  }

  return { tiles, canvasW, canvasH };
}

/**
 * Layout every platform with the photo-wall packer.
 * Same seed → same pack + drift/badge; different seeds may flip square/rect lead-in.
 */
export function layoutBubbleField(platforms: BubblePlatformDef[], seed = 42): BubbleLayoutItem[] {
  const rand = mulberry32(seed);
  const startWithSquare = rand() >= 0.5;
  const { tiles, canvasW, canvasH } = packPhotoWall(platforms, { startWithSquare });

  const byId = new Map(tiles.map((t) => [t.id, t]));

  return platforms.map((platform, i) => {
    const tile = byId.get(platform.id)!;
    return {
      id: platform.id,
      x: ((tile.left + tile.width / 2) / canvasW) * 100,
      y: ((tile.top + tile.height / 2) / canvasH) * 100,
      driftDelay: rand() * 1.8,
      driftDuration: 7 + rand() * 3 + i * 0.12,
      badgeCorner: BADGE_CORNERS[Math.floor(rand() * BADGE_CORNERS.length)],
    };
  });
}

type Rect = { left: number; right: number; top: number; bottom: number };

function packedToRect(tile: PackedTile): Rect {
  return {
    left: tile.left,
    right: tile.left + tile.width,
    top: tile.top,
    bottom: tile.top + tile.height,
  };
}

function aabbOverlap(a: Rect, b: Rect, pad: number): boolean {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
}

/** Pixel-space overlap check against the packed photo wall (authoritative). */
export function packedWallHasOverlap(
  platforms: BubblePlatformDef[],
  seed = 42,
  padPx = 0
): boolean {
  const rand = mulberry32(seed);
  const { tiles } = packPhotoWall(platforms, { startWithSquare: rand() >= 0.5 });
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (aabbOverlap(packedToRect(tiles[i]), packedToRect(tiles[j]), padPx)) return true;
    }
  }
  return false;
}

/** Minimum edge gap between any two packed tiles (px). */
export function packedWallMinGap(platforms: BubblePlatformDef[], seed = 42): number {
  const rand = mulberry32(seed);
  const { tiles } = packPhotoWall(platforms, { startWithSquare: rand() >= 0.5 });
  let minGap = Number.POSITIVE_INFINITY;

  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = packedToRect(tiles[i]);
      const b = packedToRect(tiles[j]);
      const gapX = Math.max(b.left - a.right, a.left - b.right);
      const gapY = Math.max(b.top - a.bottom, a.top - b.bottom);
      // Separating-axis gap: if they share a projection on one axis, use the other
      const xOverlap = a.left < b.right && a.right > b.left;
      const yOverlap = a.top < b.bottom && a.bottom > b.top;
      let gap: number;
      if (xOverlap && !yOverlap) gap = gapY;
      else if (yOverlap && !xOverlap) gap = gapX;
      else if (!xOverlap && !yOverlap) gap = Math.hypot(Math.max(gapX, 0), Math.max(gapY, 0));
      else gap = 0; // overlapping
      minGap = Math.min(minGap, gap);
    }
  }

  return Number.isFinite(minGap) ? minGap : 0;
}

/** @deprecated Prefer packedWallHasOverlap — kept for existing tests using % layout. */
export function layoutHasOverlap(
  platforms: BubblePlatformDef[],
  layout: BubbleLayoutItem[],
  canvasAspect = 1.4,
  padPct = 0.5
): boolean {
  const canvasW = PHOTO_WALL_CANVAS_W;
  const canvasH = canvasW / canvasAspect;
  const byId = new Map(platforms.map((p) => [p.id, p]));
  const rects = layout.map((item) => {
    const dims = getBubbleDimensions(byId.get(item.id)!);
    const halfW = (dims.width / canvasW) * 50;
    const halfH = (dims.height / canvasH) * 50;
    return {
      left: item.x - halfW,
      right: item.x + halfW,
      top: item.y - halfH,
      bottom: item.y + halfH,
    };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (aabbOverlap(rects[i], rects[j], padPct)) return true;
    }
  }
  return false;
}

export function badgeCornerClass(corner: BadgeCorner): string {
  switch (corner) {
    case 'tl':
      return 'left-1.5 top-1.5';
    case 'tr':
      return 'right-1.5 top-1.5';
    case 'bl':
      return 'bottom-1.5 left-1.5';
    case 'br':
      return 'bottom-1.5 right-1.5';
  }
}

export interface BubbleIdentity {
  displayName: string;
  avatarUrl?: string | null;
  secondary?: string | null;
}

/** Prefer a short identity signal — never dump project lists into the bubble. */
export function identityFromGitHubImport(data: unknown): BubbleIdentity | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const gh = d.githubProfile as Record<string, unknown> | undefined;
  const profile = d.profile as Record<string, unknown> | undefined;
  const username = (gh?.username as string) || null;
  const avatarUrl = (gh?.avatarUrl as string) || (profile?.avatarUrl as string) || null;
  if (!username && !avatarUrl) return null;
  return {
    displayName: username ? `@${username}` : 'GitHub',
    avatarUrl,
    secondary: (gh?.bio as string) || null,
  };
}

export function identityFromLinkedInImport(data: unknown): BubbleIdentity | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const from = d.fromLinkedIn as Record<string, unknown> | undefined;
  const profile = d.profile as Record<string, unknown> | undefined;
  const name =
    (from?.username as string) ||
    [from?.firstName, from?.lastName].filter(Boolean).join(' ') ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const avatarUrl = (from?.avatarUrl as string) || (profile?.avatarUrl as string) || null;
  if (!name && !avatarUrl) return null;
  return { displayName: name || 'LinkedIn', avatarUrl };
}

export function identityFromGoogleImport(data: unknown): BubbleIdentity | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const from = d.fromGoogle as Record<string, unknown> | undefined;
  const profile = d.profile as Record<string, unknown> | undefined;
  const name =
    (from?.username as string) ||
    [from?.firstName, from?.lastName].filter(Boolean).join(' ') ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const avatarUrl = (from?.avatarUrl as string) || (profile?.avatarUrl as string) || null;
  const email = (from?.email as string) || (d.email as string) || null;
  if (!name && !avatarUrl && !email) return null;
  return {
    displayName: name || email || 'Google',
    avatarUrl,
    secondary: name && email ? email : null,
  };
}

export function identityFromLinkHandle(
  platform: BubblePlatformId,
  handle: string,
  data?: unknown
): BubbleIdentity {
  const cleaned = handle.replace(/^@/, '').trim();
  if (platform === 'youtube') {
    const videos = (data as { youtubeVideos?: Array<{ channelTitle?: string }> })?.youtubeVideos;
    const channelTitle = videos?.[0]?.channelTitle;
    return {
      displayName: channelTitle || (cleaned.startsWith('@') ? cleaned : `@${cleaned}`),
    };
  }
  if (platform === 'medium' || platform === 'substack') {
    return { displayName: cleaned ? `@${cleaned.replace(/^@/, '')}` : platform };
  }
  if (platform === 'links' || platform === 'portfolio') {
    try {
      const host = new URL(cleaned.startsWith('http') ? cleaned : `https://${cleaned}`).hostname;
      return { displayName: host.replace(/^www\./, '') };
    } catch {
      return { displayName: cleaned || (platform === 'portfolio' ? 'Portfolio' : 'Link') };
    }
  }
  return { displayName: cleaned || platform };
}

export function extractMediumUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('medium.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) return pathParts[0].replace(/^@/, '');
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '');
}

export function extractSubstackIdentifier(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('substack.com')) {
      const subdomain = url.hostname.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'substack') return subdomain;
    }
  } catch {
    // fall through
  }
  const substackMatch = trimmed.match(/^([\w-]+)\.substack\.com/i);
  if (substackMatch) return substackMatch[1];
  return trimmed.replace(/^@/, '');
}

export function extractYouTubeChannel(input: string): string {
  return input.trim();
}

/** Normalize a GitHub username or profile URL to a bare username. */
export function extractGitHubUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('github.com')) {
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) return pathParts[0].replace(/^@/, '');
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '').replace(/^github\.com\//i, '');
}

/** Normalize a LinkedIn profile URL or vanity slug. */
export function extractLinkedInSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('linkedin.com')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const inIdx = parts.findIndex((p) => p === 'in' || p === 'pub');
      if (inIdx >= 0 && parts[inIdx + 1]) return parts[inIdx + 1];
      if (parts.length > 0) return parts[parts.length - 1];
    }
  } catch {
    // fall through
  }
  return trimmed.replace(/^@/, '').replace(/^linkedin\.com\/in\//i, '');
}

/** Ensure a pasted profile/link value is an absolute URL when possible. */
export function normalizePastedUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') || trimmed.includes('/')) return `https://${trimmed}`;
  return trimmed;
}

/** Local bubble state after Change vs Remove (OAuth unlink is handled by the UI). */
export function nextBubbleStateAfterManage(
  authMode: BubbleAuthMode,
  action: 'change' | 'remove',
  currentInput: string
): { status: 'idle'; identity: null; input: string; keepEditorOpen: boolean; keepInput: boolean } {
  if (action === 'remove') {
    return {
      status: 'idle',
      identity: null,
      input: '',
      keepEditorOpen: false,
      keepInput: false,
    };
  }
  const keepInput = authMode === 'link';
  return {
    status: 'idle',
    identity: null,
    input: keepInput ? currentInput : '',
    keepEditorOpen: true,
    keepInput,
  };
}
