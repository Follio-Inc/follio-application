/** Dwell before a hover opens a peek — passing through does not count. */
export const PEEK_OPEN_DELAY_MS = 550;
/** Grace period so the pointer can travel from the name into the panel. */
export const PEEK_CLOSE_DELAY_MS = 200;

export function hoverOpensAfter(heldMs: number): boolean {
  return heldMs >= PEEK_OPEN_DELAY_MS;
}

export function hoverClosesAfterLeave(pinned: boolean, leftMs: number): boolean {
  if (pinned) return false;
  return leftMs >= PEEK_CLOSE_DELAY_MS;
}

/** Touch and coarse pointers open on tap only. */
export function canHoverOpenPeek(media: { hover: string; pointer: string }): boolean {
  return media.hover === 'hover' && media.pointer === 'fine';
}
