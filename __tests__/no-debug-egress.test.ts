/**
 * No unauthorized debug egress from server code.
 *
 * Phase 4 found two leftover `#region agent log` blocks in the Builder's
 * server layout that POSTed to `http://127.0.0.1:7254/ingest/<uuid>` on every
 * page load, plus an extra `information_schema` query to fill them. They were
 * left over from an investigation into a since-removed `WorkExperience.tags`
 * column (migration 20260725000000) and nothing referenced them.
 *
 * What they actually sent was schema metadata and Prisma error `meta` — not
 * resume text and not credentials — so this was never a data breach. It was
 * still an unauthenticated outbound channel opened from a server component on
 * a path every Builder user hits, and the kind of thing that gets copied into
 * the next debugging session and forgotten again.
 *
 * This test is the thing that makes it stay gone. It scans shipped server and
 * client source for hardcoded loopback requests and for the editor-fold
 * markers those blocks hid behind.
 *
 * It deliberately does **not** object to:
 *   - URLs built from environment variables, which is how the real local
 *     services (the PDF worker, the dev database) are addressed;
 *   - anything under `local-tests/`, `scripts/` or `_admin-panel/`, which are
 *     developer tools rather than shipped paths;
 *   - `logger` calls, which are the project's real logging infrastructure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** Shipped application code. Developer tooling is deliberately out of scope. */
const SCANNED_ROOTS = ['app', 'lib', 'services', 'components', 'hooks', 'types'];

const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__']);

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = path.join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectSourceFiles(full, found);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

const SOURCE_FILES = SCANNED_ROOTS.flatMap((root) => collectSourceFiles(path.join(ROOT, root)));

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

/** Strip comments so prose about a port is not mistaken for a request to one. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('shipped code makes no hardcoded loopback requests', () => {
  it('found files to scan, so a silent miss is not mistaken for a pass', () => {
    // Without this, a broken path would make every assertion below vacuous.
    expect(SOURCE_FILES.length).toBeGreaterThan(200);
  });

  it('never fetches a hardcoded localhost or 127.0.0.1 URL', () => {
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      // A literal loopback URL inside a request. Env-driven URLs are fine and
      // are how the PDF worker and the local database are actually addressed.
      const matches = source.match(
        /fetch\s*\(\s*['"`]https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/g
      );
      if (matches) offenders.push(`${relative(file)} (${matches.length})`);
    }

    expect(offenders).toEqual([]);
  });

  it('carries no ad-hoc ingest endpoint', () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /\/ingest\/[0-9a-f-]{16,}/.test(stripComments(readFileSync(file, 'utf8')))
    ).map(relative);

    expect(offenders).toEqual([]);
  });

  it('carries no X-Debug-Session-Id header', () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /X-Debug-Session-Id/i.test(stripComments(readFileSync(file, 'utf8')))
    ).map(relative);

    expect(offenders).toEqual([]);
  });

  it('leaves no "#region agent log" folds behind', () => {
    // Comments are scanned here on purpose: the marker *is* a comment, and it
    // is what the removed blocks hid behind in an editor.
    const offenders = SOURCE_FILES.filter((file) =>
      /#region\s+agent\s+log/i.test(readFileSync(file, 'utf8'))
    ).map(relative);

    expect(offenders).toEqual([]);
  });
});

describe('the Builder layout loads the profile and nothing else', () => {
  // `path.join(process.cwd(), …)` inline rather than through the `ROOT`
  // constant: that is the shape the Developer Platform's import graph
  // recognises as "this suite asserts on that file", which is how it
  // attributes this test to the Builder rather than calling it unresolvable.
  const layout = readFileSync(
    path.join(process.cwd(), 'app/(dashboard)/builder/layout.tsx'),
    'utf8'
  );

  it('makes no outbound fetch at all', () => {
    expect(stripComments(layout)).not.toMatch(/\bfetch\s*\(/);
  });

  it('no longer queries information_schema on every page load', () => {
    // The removed block ran an extra round-trip per Builder load purely to
    // fill a debug payload.
    expect(layout).not.toContain('information_schema');
  });

  it('still fetches the profile through the retrying Prisma helper', () => {
    // The cleanup must not have taken the real work with it.
    expect(layout).toContain('withPrismaRetry');
    expect(layout).toContain('db.profile.findUnique');
    expect(layout).toContain('PROFILE_INCLUDE');
  });
});
