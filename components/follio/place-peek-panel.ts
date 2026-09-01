/**
 * Place a reading panel the way a desktop context menu is placed: prefer the
 * pointer as the top-left, then flip or clamp so the panel stays in view.
 */

export type PeekPoint = { x: number; y: number };
export type PeekSize = { width: number; height: number };
export type PeekViewport = { width: number; height: number };

export type PeekPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export const PEEK_VIEW_PADDING = 8;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placePeekPanel({
  origin,
  size,
  viewport,
  padding = PEEK_VIEW_PADDING,
}: {
  origin: PeekPoint;
  size: PeekSize;
  viewport: PeekViewport;
  padding?: number;
}): PeekPlacement {
  const width = Math.max(0, Math.min(size.width, viewport.width - padding * 2));
  const maxHeight = Math.max(0, viewport.height - padding * 2);
  const height = Math.min(Math.max(size.height, 0), maxHeight);

  let left = origin.x;
  if (left + width + padding > viewport.width) {
    left = origin.x - width;
  }
  left = clamp(left, padding, viewport.width - width - padding);

  let top = origin.y;
  if (top + height + padding > viewport.height) {
    top = origin.y - height;
  }
  top = clamp(top, padding, viewport.height - height - padding);

  return { top, left, width, maxHeight };
}
