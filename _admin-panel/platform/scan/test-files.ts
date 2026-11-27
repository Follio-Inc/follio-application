import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Finding the repository's test files.
 *
 * Split out from `tests.ts` so a caller that only needs the walk does not drag
 * in the TypeScript compiler with it. Signal 2 parses every test to build the
 * import graph; the Test Console (PLATFORM_TODO item 11) only needs to know
 * what is on disk, and it is rendered on an admin page request. One walk, two
 * callers — a second implementation would eventually disagree about what
 * counts as a test file.
 *
 * Server-only: reads directories.
 */

/** Where Vitest files live, relative to the repo root. */
export const TEST_ROOT = '__tests__';

/** Every Vitest file, sorted. */
export function discoverTestFiles(repoRoot: string = process.cwd()): string[] {
  const found: string[] = [];

  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(path.join(repoRoot, relativeDir), { withFileTypes: true })) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        found.push(relativePath);
      }
    }
  };

  walk(TEST_ROOT);
  return found.sort();
}
