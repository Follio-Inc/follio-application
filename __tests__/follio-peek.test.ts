import { describe, expect, it, vi } from 'vitest';

import { focusWithoutScroll } from '@/components/follio/follio-peek';
import {
  canHoverOpenPeek,
  hoverClosesAfterLeave,
  hoverOpensAfter,
  PEEK_CLOSE_DELAY_MS,
  PEEK_OPEN_DELAY_MS,
} from '@/components/follio/peek-hover';
import { PEEK_VIEW_PADDING, placePeekPanel } from '@/components/follio/place-peek-panel';
import { rewriteHighlights } from '@/lib/follio-identity';

describe('focusWithoutScroll', () => {
  it('cancels the default focus behaviour that would scroll the page', () => {
    const preventDefault = vi.fn();
    const focus = vi.fn();
    const target = Object.assign(Object.create(null), { focus });

    focusWithoutScroll({ preventDefault, target } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('peek hover dwell', () => {
  it('does not open just from moving the cursor across the name', () => {
    expect(hoverOpensAfter(80)).toBe(false);
    expect(hoverOpensAfter(PEEK_OPEN_DELAY_MS - 1)).toBe(false);
  });

  it('opens after the pointer rests on the name', () => {
    expect(hoverOpensAfter(PEEK_OPEN_DELAY_MS)).toBe(true);
  });

  it('stays open after a click even if the pointer leaves', () => {
    expect(hoverClosesAfterLeave(true, PEEK_CLOSE_DELAY_MS + 50)).toBe(false);
  });

  it('closes a hover peek after the pointer leaves the name and the panel', () => {
    expect(hoverClosesAfterLeave(false, PEEK_CLOSE_DELAY_MS)).toBe(true);
  });

  it('opens on hover only for fine pointers, not touch', () => {
    expect(canHoverOpenPeek({ hover: 'hover', pointer: 'fine' })).toBe(true);
    expect(canHoverOpenPeek({ hover: 'none', pointer: 'coarse' })).toBe(false);
  });
});

describe('placePeekPanel', () => {
  const viewport = { width: 1000, height: 800 };
  const padding = PEEK_VIEW_PADDING;

  it('opens down-right from the pointer when there is room', () => {
    expect(
      placePeekPanel({
        origin: { x: 120, y: 90 },
        size: { width: 320, height: 200 },
        viewport,
      })
    ).toEqual({
      top: 90,
      left: 120,
      width: 320,
      maxHeight: viewport.height - padding * 2,
    });
  });

  it('flips left when the panel would overflow the right edge', () => {
    const placed = placePeekPanel({
      origin: { x: 900, y: 80 },
      size: { width: 320, height: 200 },
      viewport,
    });

    expect(placed.left).toBe(900 - 320);
    expect(placed.top).toBe(80);
  });

  it('flips up when the panel would overflow the bottom edge', () => {
    const placed = placePeekPanel({
      origin: { x: 80, y: 740 },
      size: { width: 320, height: 200 },
      viewport,
    });

    expect(placed.top).toBe(740 - 200);
    expect(placed.left).toBe(80);
  });

  it('clamps into the viewport and caps height so long copy can scroll', () => {
    const placed = placePeekPanel({
      origin: { x: 40, y: 40 },
      size: { width: 320, height: 2400 },
      viewport,
    });

    expect(placed.top).toBe(padding);
    expect(placed.maxHeight).toBe(viewport.height - padding * 2);
    expect(placed.left).toBeGreaterThanOrEqual(padding);
  });

  it('stays inside a narrow viewport instead of overflowing', () => {
    const placed = placePeekPanel({
      origin: { x: 12, y: 20 },
      size: { width: 360, height: 180 },
      viewport: { width: 320, height: 500 },
    });

    expect(placed.width).toBe(320 - padding * 2);
    expect(placed.left).toBe(padding);
    expect(placed.top).toBeGreaterThanOrEqual(padding);
  });
});

describe('role peek copy', () => {
  it('keeps a long proof point complete instead of cutting it with an ellipsis', () => {
    const line =
      'Designed the first published algorithm for the Analytical Engine and documented every step of the method so later mathematicians could reproduce the work in full.';

    expect(rewriteHighlights({ bullets: [line] })).toEqual([line]);
    expect(rewriteHighlights({ bullets: [line] })[0]).not.toMatch(/…$/);
  });
});
