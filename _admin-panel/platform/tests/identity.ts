/**
 * Stable test identity (PLATFORM_TODO item 16).
 *
 * Its own module because three things now share it — item 16's history, item
 * 26's failure baseline and item 27's performance baseline — and item 27's
 * flags are rendered by **client** components. `history.ts` reads the
 * filesystem, so importing the rule from there would pull `node:fs` into a
 * browser bundle; this file has no imports at all.
 *
 * `history.ts` re-exports it, so every existing caller is unchanged.
 */

/** `file > suite > … > name`. Stable, and never an array position. */
export function testIdentity(test: { file: string | null; suite: string[]; name: string }): string {
  return [test.file ?? '', ...test.suite, test.name].filter((part) => part !== '').join(' > ');
}
