export interface ThreadPoint {
  x: number;
  y: number;
}

/**
 * A light curve between a resume phrase and the job requirement it supports.
 * Side-by-side layouts bow across the gutter. Stacked layouts bow through
 * the gap between the two sheets.
 */
export function buildThreadPath(from: ThreadPoint, to: ThreadPoint): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fmt = (value: number) => String(Math.round(value * 10) / 10);
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  if (horizontal) {
    const bend = Math.max(36, Math.abs(dx) * 0.42) * Math.sign(dx || 1);
    return `M ${fmt(from.x)} ${fmt(from.y)} C ${fmt(from.x + bend)} ${fmt(from.y)}, ${fmt(to.x - bend)} ${fmt(to.y)}, ${fmt(to.x)} ${fmt(to.y)}`;
  }

  const bend = Math.max(36, Math.abs(dy) * 0.42) * Math.sign(dy || 1);
  return `M ${fmt(from.x)} ${fmt(from.y)} C ${fmt(from.x)} ${fmt(from.y + bend)}, ${fmt(to.x)} ${fmt(to.y - bend)}, ${fmt(to.x)} ${fmt(to.y)}`;
}
