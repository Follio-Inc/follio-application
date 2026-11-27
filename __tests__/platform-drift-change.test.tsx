/**
 * Recent change analysis (Drift intelligence, step 1).
 *
 * The parser is driven with **real recorded git output** — the byte shapes were
 * captured from `git show --name-status --find-renames --format= -z` against a
 * throwaway repository containing an add, a modify and a rename, and against a
 * root commit. Inventing the format and then testing against the invention
 * would prove nothing.
 *
 * Mapping is tested against synthetic features rather than the live coverage
 * map, so the assertions do not move when the map does; a separate block checks
 * the real repository end to end.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { COVERAGE_MAP } from '@/_admin-panel/platform/coverage-map';
import type { PlatformFeature } from '@/_admin-panel/platform/coverage-map';
import {
  analyzeLatestChange,
  parseNameStatus,
  readLatestCommit,
  toChangeStatus,
} from '@/_admin-panel/platform/drift';
import type { GitResult } from '@/_admin-panel/platform/drift';
import { DriftChangePanel } from '@/_admin-panel/platform/ui/drift-change-panel';

const ANALYSIS = '_admin-panel/platform/drift/change-analysis.ts';
const TYPES = '_admin-panel/platform/drift/change-types.ts';
const PANEL = '_admin-panel/platform/ui/drift-change-panel.tsx';
const ROUTE = 'app/api/admin/platform/drift/analyze/route.ts';
const DRIFT_PAGE = 'app/admin/(dashboard)/platform/drift/page.tsx';

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/**
 * Comments removed, string literals kept.
 *
 * These modules explain their own git-safety contract in prose, so they name
 * `checkout`, `reset` and `shell` in doc comments. An assertion that those
 * words are absent would otherwise pass against the explanation rather than
 * the code — the trap that let mutations survive in items 27 through 30.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Comments and string literals removed. */
function codeOf(source: string): string {
  return withoutComments(source)
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** Builds a git seam from a map of joined-argv to result. */
function fakeGit(responses: Record<string, GitResult>, seen?: string[][]) {
  return (args: string[]): GitResult => {
    seen?.push(args);
    const key = args.join(' ');
    return responses[key] ?? { status: 1, stdout: '' };
  };
}

const INSIDE = { status: 0, stdout: 'true\n' };
const LOG_KEY = 'log -1 --no-color --format=%H%x00%h%x00%s HEAD';
const SHOW_KEY = 'show --no-color --name-status --find-renames --format= -z HEAD';
const PARENT_KEY = 'rev-parse --verify -q HEAD^';

function logLine(sha: string, short: string, subject: string): GitResult {
  return { status: 0, stdout: `${sha}\u0000${short}\u0000${subject}\n` };
}

const SHA = 'a'.repeat(40);

/** A minimal feature, so a test states only the fields it depends on. */
function feature(overrides: Partial<PlatformFeature> & { id: string }): PlatformFeature {
  return {
    name: overrides.id,
    userDescription: 'x',
    codeLocations: [],
    category: 'Builder',
    status: 'shipped',
    unitTests: [],
    pathways: [],
    ...overrides,
  } as PlatformFeature;
}

describe('parsing git --name-status -z', () => {
  it('reads a simple add, exactly as git emitted it', () => {
    // Recorded: `A\0checkpoints.md\0`
    expect(parseNameStatus('A\u0000checkpoints.md\u0000')).toEqual([
      { path: 'checkpoints.md', status: 'added', code: 'A', previousPath: null },
    ]);
  });

  it('reads an add, a modify and a rename from one commit', () => {
    // Recorded from a throwaway repo:
    // `A\0added.ts\0M\0keep.ts\0R100\0old/a.ts\0new-a.ts\0`
    const files = parseNameStatus(
      'A\u0000added.ts\u0000M\u0000keep.ts\u0000R100\u0000old/a.ts\u0000new-a.ts\u0000'
    );

    expect(files).toEqual([
      { path: 'added.ts', status: 'added', code: 'A', previousPath: null },
      { path: 'keep.ts', status: 'modified', code: 'M', previousPath: null },
      // The rename carries two paths: the new one is `path`, the old one is kept.
      { path: 'new-a.ts', status: 'renamed', code: 'R100', previousPath: 'old/a.ts' },
    ]);
  });

  it('reads a root commit, where git lists the whole tree as added', () => {
    // Recorded: `A\0keep.ts\0A\0old/a.ts\0`
    const files = parseNameStatus('A\u0000keep.ts\u0000A\u0000old/a.ts\u0000');

    expect(files.map((f) => f.status)).toEqual(['added', 'added']);
    expect(files.map((f) => f.path)).toEqual(['keep.ts', 'old/a.ts']);
  });

  it('keeps paths containing spaces and quotes intact', () => {
    // The reason for `-z`: without it git would quote this path.
    const files = parseNameStatus('M\u0000app/a "b" c/page.tsx\u0000');

    expect(files[0].path).toBe('app/a "b" c/page.tsx');
  });

  it('drops a truncated trailing record rather than half-reading it', () => {
    // What a truncated maxBuffer looks like: a status with no path.
    expect(parseNameStatus('M\u0000keep.ts\u0000A\u0000')).toEqual([
      { path: 'keep.ts', status: 'modified', code: 'M', previousPath: null },
    ]);
    // And a rename missing its second path.
    expect(parseNameStatus('R100\u0000old.ts\u0000')).toEqual([]);
  });

  it('surfaces an unexpected status instead of calling it modified', () => {
    const files = parseNameStatus('X\u0000odd.ts\u0000');

    expect(files[0].status).toBe('other');
    expect(files[0].code).toBe('X');
  });

  it('maps every status code git can report', () => {
    expect(toChangeStatus('A')).toBe('added');
    expect(toChangeStatus('M')).toBe('modified');
    expect(toChangeStatus('D')).toBe('deleted');
    expect(toChangeStatus('R100')).toBe('renamed');
    expect(toChangeStatus('C75')).toBe('copied');
    expect(toChangeStatus('T')).toBe('type-changed');
    expect(toChangeStatus('U')).toBe('other');
  });
});

describe('reading the latest commit', () => {
  it('returns the sha, the abbreviation and the subject', () => {
    const git = fakeGit({
      [LOG_KEY]: logLine(SHA, 'aaaaaaa', 'feat: a thing'),
      [PARENT_KEY]: { status: 0, stdout: `${'b'.repeat(40)}\n` },
    });

    expect(readLatestCommit(git)).toEqual({
      sha: SHA,
      shortSha: 'aaaaaaa',
      subject: 'feat: a thing',
      hasParent: true,
    });
  });

  it('keeps a subject containing the separator-ish characters whole', () => {
    const git = fakeGit({
      [LOG_KEY]: logLine(SHA, 'aaaaaaa', 'fix: a | b\tc %h'),
      [PARENT_KEY]: { status: 0, stdout: 'x\n' },
    });

    expect(readLatestCommit(git)?.subject).toBe('fix: a | b\tc %h');
  });

  it('reports a root commit as having no parent', () => {
    // `rev-parse --verify -q HEAD^` exits non-zero on the first commit.
    const git = fakeGit({ [LOG_KEY]: logLine(SHA, 'aaaaaaa', 'first') });

    expect(readLatestCommit(git)?.hasParent).toBe(false);
  });

  it('refuses output that is not a sha', () => {
    expect(readLatestCommit(fakeGit({ [LOG_KEY]: logLine('nope', 'n', 's') }))).toBeNull();
    expect(readLatestCommit(fakeGit({}))).toBeNull();
  });
});

describe('mapping changed files to coverage-map features', () => {
  const features = [
    feature({
      id: 'builder',
      name: 'Resume builder',
      codeLocations: ['app/(dashboard)/builder', 'services/resume.service.ts'],
      unitTests: ['__tests__/builder.test.ts'],
      pathways: ['builder.designer-templates'],
      lab: 'builder-lab',
    }),
    feature({
      id: 'shared-import',
      name: 'Imports',
      codeLocations: ['services/import'],
      unitTests: [],
      pathways: [],
    }),
    feature({
      id: 'also-builder',
      name: 'Builder extras',
      codeLocations: ['app/(dashboard)/builder/components'],
      unitTests: ['__tests__/extras.test.ts'],
      pathways: [],
    }),
  ];

  function analyze(nameStatus: string, options: { subject?: string } = {}) {
    return analyzeLatestChange({
      features,
      git: fakeGit({
        'rev-parse --is-inside-work-tree': INSIDE,
        [LOG_KEY]: logLine(SHA, 'aaaaaaa', options.subject ?? 'feat: x'),
        [PARENT_KEY]: { status: 0, stdout: 'parent\n' },
        [SHOW_KEY]: { status: 0, stdout: nameStatus },
      }),
    });
  }

  it('maps a file to the feature whose codeLocations claim it', () => {
    const result = analyze('M\u0000services/resume.service.ts\u0000');

    expect(result.error).toBeNull();
    expect(result.features.map((f) => f.id)).toEqual(['builder']);
    expect(result.features[0].matchedPaths).toEqual(['services/resume.service.ts']);
    // And says which declaration did the matching, so the reader can check it.
    expect(result.features[0].matchedLocations).toEqual(['services/resume.service.ts']);
    expect(result.unmapped).toEqual([]);
  });

  it('maps a file under a claimed directory', () => {
    const result = analyze('M\u0000services/import/resume-ai.service.ts\u0000');

    expect(result.features.map((f) => f.id)).toEqual(['shared-import']);
    expect(result.features[0].matchedLocations).toEqual(['services/import']);
  });

  it('shows every feature that legitimately claims the same file', () => {
    // Two features declare overlapping directories; both own this path.
    const result = analyze('M\u0000app/(dashboard)/builder/components/zoom.tsx\u0000');

    expect(result.features.map((f) => f.id)).toEqual(['also-builder', 'builder']);
    expect(result.summary.affectedFeatures).toBe(2);
  });

  it('does not match a path that merely shares a prefix', () => {
    // `app/(dashboard)/builder-legacy` is not inside `app/(dashboard)/builder`.
    const result = analyze('M\u0000app/(dashboard)/builder-legacy/page.tsx\u0000');

    expect(result.features).toEqual([]);
    expect(result.unmapped).toEqual(['app/(dashboard)/builder-legacy/page.tsx']);
  });

  it('reports an unclaimed file as unmapped rather than guessing an owner', () => {
    const result = analyze('A\u0000checkpoints.md\u0000M\u0000services/resume.service.ts\u0000');

    expect(result.unmapped).toEqual(['checkpoints.md']);
    expect(result.features.map((f) => f.id)).toEqual(['builder']);
    expect(result.summary.unmappedFiles).toBe(1);
  });

  it('matches a rename on its old path as well as its new one', () => {
    // Moved out of a claimed directory: the feature still declares the old
    // path, so it is still affected.
    const result = analyze('R100\u0000services/resume.service.ts\u0000lib/moved.ts\u0000');

    expect(result.features.map((f) => f.id)).toEqual(['builder']);
    expect(result.features[0].matchedLocations).toEqual(['services/resume.service.ts']);
    expect(result.unmapped).toEqual([]);
  });

  it('still maps a deleted file the map continues to declare', () => {
    const result = analyze('D\u0000services/resume.service.ts\u0000');

    expect(result.files[0].status).toBe('deleted');
    expect(result.features.map((f) => f.id)).toEqual(['builder']);
  });

  it('deduplicates a feature touched by several files', () => {
    const result = analyze(
      'M\u0000services/resume.service.ts\u0000M\u0000app/(dashboard)/builder/page.tsx\u0000'
    );

    expect(result.features).toHaveLength(1);
    expect(result.features[0].matchedPaths).toEqual([
      'app/(dashboard)/builder/page.tsx',
      'services/resume.service.ts',
    ]);
    expect(result.features[0].matchedLocations).toEqual([
      'app/(dashboard)/builder',
      'services/resume.service.ts',
    ]);
  });

  it('passes the feature’s own tests, pathways and lab through unchanged', () => {
    const result = analyze('M\u0000services/resume.service.ts\u0000');
    const built = result.features[0];

    expect(built.unitTests).toEqual(['__tests__/builder.test.ts']);
    expect(built.labId).toBe('builder-lab');
    // Resolved against the real Live QA catalog, which defines this id.
    expect(built.pathways).toEqual([
      {
        id: 'builder.designer-templates',
        title: 'Designer: switch templates',
        spec: 'pathways/builder-designer.spec.ts',
      },
    ]);
  });

  it('marks a declared pathway the catalog does not define', () => {
    const result = analyzeLatestChange({
      features: [feature({ id: 'f', codeLocations: ['a.ts'], pathways: ['not.a.pathway'] })],
      git: fakeGit({
        'rev-parse --is-inside-work-tree': INSIDE,
        [LOG_KEY]: logLine(SHA, 'aaaaaaa', 's'),
        [PARENT_KEY]: { status: 0, stdout: 'p' },
        [SHOW_KEY]: { status: 0, stdout: 'M\u0000a.ts\u0000' },
      }),
    });

    expect(result.features[0].pathways).toEqual([{ id: 'not.a.pathway', title: null, spec: null }]);
  });

  it('derives every count rather than asserting one', () => {
    const result = analyze(
      'M\u0000services/resume.service.ts\u0000M\u0000services/import/a.ts\u0000A\u0000x.md\u0000'
    );

    expect(result.summary).toEqual({
      changedFiles: 3,
      affectedFeatures: 2,
      unmappedFiles: 1,
      // `shared-import` declares neither; `builder` declares both.
      featuresWithoutTests: 1,
      featuresWithoutPathways: 1,
    });
  });
});

describe('failing safely', () => {
  it('says so when the directory is not a git work tree', () => {
    const result = analyzeLatestChange({ git: fakeGit({}) });

    expect(result.error).toBe('not-a-repository');
    expect(result.commit).toBeNull();
    expect(result.features).toEqual([]);
    expect(result.detail).not.toBe('');
  });

  it('says so when there is no commit', () => {
    const result = analyzeLatestChange({
      git: fakeGit({ 'rev-parse --is-inside-work-tree': INSIDE }),
    });

    expect(result.error).toBe('no-commits');
  });

  it('reports a git that cannot be run at all', () => {
    const result = analyzeLatestChange({
      git: () => {
        throw new Error('spawn git ENOENT');
      },
    });

    expect(result.error).toBe('git-unavailable');
  });

  it('reports a failing show without inventing an empty commit', () => {
    const result = analyzeLatestChange({
      git: fakeGit({
        'rev-parse --is-inside-work-tree': INSIDE,
        [LOG_KEY]: logLine(SHA, 'aaaaaaa', 's'),
        [PARENT_KEY]: { status: 0, stdout: 'p' },
      }),
    });

    expect(result.error).toBe('read-failed');
    expect(result.summary.changedFiles).toBe(0);
  });

  it('never reports a count it did not derive', () => {
    for (const result of [
      analyzeLatestChange({ git: fakeGit({}) }),
      analyzeLatestChange({
        git: fakeGit({ 'rev-parse --is-inside-work-tree': INSIDE }),
      }),
    ]) {
      expect(Object.values(result.summary).every((value) => value === 0)).toBe(true);
    }
  });
});

describe('git safety', () => {
  const source = withoutComments(read(ANALYSIS));
  const executable = codeOf(read(ANALYSIS));

  it('runs only read-only git subcommands', () => {
    const args = [...source.matchAll(/git\(\[([\s\S]*?)\]\)/g)].map((match) => match[1]);
    expect(args.length, 'the module should invoke git').toBeGreaterThan(0);

    const subcommands = args.map((block) => /'([a-z-]+)'/.exec(block)?.[1]);
    expect([...new Set(subcommands)].sort()).toEqual(['log', 'rev-parse', 'show']);
  });

  it('never names a command that could change the repository', () => {
    // Matched as a quoted argv token, not as a bare word: `format` contains
    // `rm`, and `commit` is a legitimate identifier in `readLatestCommit`.
    // The subcommand allowlist above is the strong assertion; this one catches
    // a forbidden verb smuggled in as a later argument.
    for (const forbidden of [
      'checkout',
      'reset',
      'clean',
      'stash',
      'commit',
      'restore',
      'merge',
      'rebase',
      'push',
      'cherry-pick',
      'apply',
      'add',
      'rm',
      'mv',
      'gc',
      'prune',
    ]) {
      expect(source, `'${forbidden}' must not appear as an argv token`).not.toMatch(
        new RegExp(`'${forbidden}'`)
      );
    }
    // Nor as a flag that writes.
    expect(source).not.toMatch(/'--hard'|'--force'|'-f'|'--write'/);
  });

  it('passes an argv array and never a shell', () => {
    expect(executable).toContain('spawnSync(');
    expect(executable).not.toMatch(/shell\s*:/);
    expect(executable).not.toMatch(/exec\(|execSync\(/);
    // Every git call site passes a literal array.
    expect(source).toMatch(/git\(\[/);
    expect(source).not.toMatch(/git\((?!\[)[a-zA-Z]/);
  });

  it('builds no git argument from a parameter', () => {
    // The whole argv is literal. If a commit id ever became a parameter this
    // would need a server-side allowlist, which is the point of asserting it.
    const args = [...source.matchAll(/git\(\[([\s\S]*?)\]\)/g)].map((match) => match[1]);
    for (const block of args) {
      expect(block, `argv must be literal: ${block}`).not.toMatch(/\$\{(?!UNIT_ESCAPE)/);
    }
    // The only interpolation anywhere in an argv is the NUL escape constant.
    expect(source).toContain("const UNIT_ESCAPE = '%x00'");
  });

  it('takes no commit from a caller', () => {
    // `analyzeLatestChange` accepts repoRoot, features and the git seam only.
    expect(executable).not.toMatch(/commitish|revision|range|sha\s*[?:]\s*string/);
    const signature = /export type ChangeAnalysisOptions = \{([\s\S]*?)\};/.exec(
      read(ANALYSIS)
    )?.[1];
    expect(signature).toBeDefined();
    expect(signature).not.toMatch(/commit|sha|ref|range/i);
  });

  it('prefers machine-readable output over human-formatted status', () => {
    expect(source).toContain("'--name-status'");
    expect(source).toContain("'-z'");
    // `git status` is for the working tree, not a commit, and is not parsed.
    expect(source).not.toMatch(/'status'|--porcelain/);
  });
});

describe('reusing existing infrastructure', () => {
  it('maps through the scanner’s one implementation, not a second one', () => {
    const source = read(ANALYSIS);

    expect(source).toContain("import { featuresCovering } from '../scan/surface'");
    expect(withoutComments(source)).toContain('featuresCovering(');
  });

  it('builds no second feature inventory', () => {
    const source = codeOf(read(ANALYSIS));

    // Features come from the map, never from a list declared here.
    expect(source).toContain('COVERAGE_MAP');
    expect(source).not.toMatch(/const [A-Z_]*FEATURES[A-Z_]* = \[/);
    expect(source).not.toMatch(/codeLocations:\s*\[/);
  });

  it('reads pathways from the Live QA catalog rather than restating them', () => {
    const source = read(ANALYSIS);

    expect(source).toContain('LIVE_QA_PATHWAYS');
    expect(codeOf(source)).not.toMatch(/spec:\s*''/);
  });

  it('keeps the client half free of the scanner and of node', () => {
    for (const file of [TYPES, PANEL]) {
      const source = read(file);
      expect(source, `${file} must not import the scanner`).not.toMatch(
        /from '[^']*platform\/scan/
      );
      expect(source, `${file} must not import node`).not.toMatch(/from 'node:/);
      // Comment-stripped: both files *describe* the server/client split in
      // prose, so they name the analyzer in their doc comments.
      expect(withoutComments(source), `${file} must not import the analyzer`).not.toContain(
        'change-analysis'
      );
    }
  });

  it('reuses the platform action styling for its button', () => {
    expect(read(PANEL)).toContain("from './action-styles'");
    expect(withoutComments(read(PANEL))).toContain('platformAction(');
  });
});

describe('recommending nothing', () => {
  it('has no field, function or variable that scores or recommends', () => {
    // Deliberately matched against *identifiers*, not prose: the panel's own
    // copy says it recommends nothing, and forbidding the word outright would
    // fail on the sentence that makes the guarantee.
    for (const file of [ANALYSIS, TYPES, PANEL]) {
      const source = codeOf(read(file));
      expect(source, `${file} must not score or recommend`).not.toMatch(
        /(recommend|suggest|confidence|score|priority|shouldTest)[A-Za-z]*\s*[:(=]/i
      );
    }
    // And no ranking of what to test next.
    expect(codeOf(read(ANALYSIS))).not.toMatch(/\.sort\([^)]*(score|confidence|priority)/i);
  });

  it('says plainly when a feature has no coverage, instead of filling the gap', () => {
    const panel = read(PANEL);

    expect(panel).toContain('attributes no unit test to this feature');
    expect(panel).toContain('declares no Live QA pathway');
  });

  it('calls an empty mapping a gap rather than a safe change', () => {
    expect(read(PANEL)).toContain('not a guarantee the change is safe');
  });
});

describe('the route', () => {
  const source = read(ROUTE);

  it('requires admin and the local-only gate, like every other spawning surface', () => {
    expect(source).toMatch(/await requireAdmin\(\)/);
    expect(source).toContain('assertCanRunDeveloperSuites()');
    expect(source).toContain('DeveloperSuitesDisabledError');
    expect(source).toContain("runtime = 'nodejs'");
    expect(source).toContain("dynamic = 'force-dynamic'");
  });

  it('accepts no input at all', () => {
    const executable = codeOf(source);

    expect(executable).not.toContain('request.json');
    expect(executable).not.toContain('searchParams');
    expect(executable).not.toMatch(/request\s*:/);
    // The handler takes no parameter, so there is nothing to read.
    expect(withoutComments(source)).toMatch(/export async function POST\(\)/);
  });

  it('delegates and derives nothing of its own', () => {
    expect(source).toContain('analyzeLatestChange()');
    expect(codeOf(source)).not.toMatch(/featuresCovering|COVERAGE_MAP|spawn|git/);
  });

  it('is not cached', () => {
    expect(source).toContain("'Cache-Control': 'no-store'");
  });
});

describe('the panel', () => {
  it('sends no body, no commit and no path', () => {
    const executable = codeOf(read(PANEL));

    expect(executable).toContain('fetch(');
    expect(executable).not.toMatch(/body\s*:/);
    expect(executable).not.toMatch(/JSON\.stringify/);
    expect(withoutComments(read(PANEL))).toMatch(/method:\s*'POST'/);
  });

  it('renders its prompt and button before anything is analysed', () => {
    const html = renderToStaticMarkup(<DriftChangePanel />);

    expect(html).toContain('Test intelligence');
    expect(html).toContain('Analyze latest commit');
    // Nothing is claimed before a run.
    expect(html).not.toContain('Changed files (');
    expect(html).not.toContain('Affected features (');
  });

  it('fabricates no commit or count on first render', () => {
    const html = renderToStaticMarkup(<DriftChangePanel />);

    expect(html).not.toMatch(/[0-9a-f]{7,40}/);
    expect(html).not.toContain('Latest analysis');
  });
});

describe('the Drift page', () => {
  const page = read(DRIFT_PAGE);

  it('passes the panel as a slot, still in a thin shim', () => {
    expect(page).toContain('DriftChangePanel');
    expect(page).toContain('changePanel={<DriftChangePanel />}');
    // Item 17's assertions still hold: no markup, no logic of its own.
    expect(page).not.toMatch(/className=|\.map\(|\.filter\(/);
  });

  it('leaves the existing drift findings untouched', () => {
    expect(page).toContain('buildDriftView()');
    expect(page).toContain('DriftQuarantinePanel');
    expect(page).toContain('mayMaintain');
  });

  it('renders the findings whether or not the panel is supplied', () => {
    // The slot is optional, so item 17's view does not depend on it.
    const report = read('_admin-panel/platform/ui/drift-report.tsx');
    expect(report).toMatch(/changePanel\?: React\.ReactNode/);
  });
});

describe('real git, end to end, inside a throwaway repository', () => {
  /**
   * A git repository created under the OS temp directory, never Follio.
   *
   * This exercises the **real** `spawnSync` path — no seam — so the argv, the
   * `-z` parsing and the rename detection are proven against git itself rather
   * than against recorded bytes alone. Because `repoRoot` points at a temp
   * directory, nothing here can reach the Follio working tree even if the
   * analyzer under test has been mutated.
   */
  let repo = '';

  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'drift-change-'));
    git(['init', '-q', '--initial-branch=main', '.']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'Drift Intelligence Test']);
    git(['config', 'commit.gpgsign', 'false']);

    writeFileSync(path.join(repo, 'owned.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(repo, 'untouched.ts'), 'export const b = 2;\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'first']);
  });

  afterAll(() => {
    // Point 6: the throwaway repository does not outlive the suite.
    if (repo !== '') rmSync(repo, { recursive: true, force: true });
    repo = '';
  });

  it('reads a real commit through the real spawn path', () => {
    writeFileSync(path.join(repo, 'owned.ts'), 'export const a = 2;\n');
    writeFileSync(path.join(repo, 'added.ts'), 'export const c = 3;\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'feat: real commit']);

    const result = analyzeLatestChange({
      repoRoot: repo,
      features: [
        feature({
          id: 'owner',
          codeLocations: ['owned.ts'],
          unitTests: ['__tests__/owned.test.ts'],
        }),
      ],
    });

    expect(result.error).toBeNull();
    expect(result.commit?.subject).toBe('feat: real commit');
    expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commit?.hasParent).toBe(true);
    // Parsed from git own -z output, not from a fixture.
    expect(result.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual([
      'added added.ts',
      'modified owned.ts',
    ]);
    expect(result.features.map((f) => f.id)).toEqual(['owner']);
    expect(result.features[0].unitTests).toEqual(['__tests__/owned.test.ts']);
    expect(result.unmapped).toEqual(['added.ts']);
  });

  it('detects a real rename and maps it on the old path', () => {
    git(['mv', 'owned.ts', 'moved.ts']);
    git(['commit', '-q', '-m', 'refactor: move it']);

    const result = analyzeLatestChange({
      repoRoot: repo,
      features: [feature({ id: 'owner', codeLocations: ['owned.ts'] })],
    });

    const renamed = result.files.find((f) => f.status === 'renamed');
    expect(renamed, 'git should report a rename').toBeDefined();
    expect(renamed?.previousPath).toBe('owned.ts');
    expect(renamed?.path).toBe('moved.ts');
    // The feature still declares the old path, so it is still affected.
    expect(result.features.map((f) => f.id)).toEqual(['owner']);
    expect(result.unmapped).toEqual([]);
  });

  it('handles a real root commit with no parent', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'drift-change-root-'));
    try {
      const freshGit = (args: string[]) =>
        execFileSync('git', args, { cwd: fresh, encoding: 'utf8', windowsHide: true });
      freshGit(['init', '-q', '--initial-branch=main', '.']);
      freshGit(['config', 'user.email', 'test@example.invalid']);
      freshGit(['config', 'user.name', 'Drift Intelligence Test']);
      freshGit(['config', 'commit.gpgsign', 'false']);
      writeFileSync(path.join(fresh, 'only.ts'), 'export const a = 1;\n');
      freshGit(['add', '-A']);
      freshGit(['commit', '-q', '-m', 'initial']);

      const result = analyzeLatestChange({ repoRoot: fresh, features: [] });

      expect(result.error).toBeNull();
      expect(result.commit?.hasParent).toBe(false);
      expect(result.files).toEqual([
        { path: 'only.ts', status: 'added', code: 'A', previousPath: null },
      ]);
      expect(result.detail).toContain('first commit');
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('reports a directory that is not a repository', () => {
    const plain = mkdtempSync(path.join(tmpdir(), 'drift-change-plain-'));
    try {
      expect(analyzeLatestChange({ repoRoot: plain }).error).toBe('not-a-repository');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe('this suite cannot touch the real repository by accident', () => {
  const suite = readFileSync(
    path.join(process.cwd(), '__tests__/platform-drift-change.test.tsx'),
    'utf8'
  );

  /**
   * The suite with *this* block removed.
   *
   * Everything below scans the suite's own source, and this block necessarily
   * mentions the very markers it looks for — `mkdtempSync`, `cwd:`,
   * `analyzeLatestChange()`. Counting those made the first two versions of
   * these tests wrong in both directions: one expected a creation that did not
   * exist, another found call sites that were only regex literals. Removing
   * the block is simpler and more honest than trying to strip regex syntax.
   */
  const scanned = (() => {
    const start = suite.indexOf("describe('this suite cannot touch");
    expect(start, 'this block must be findable').toBeGreaterThan(-1);
    const end = suite.indexOf('\ndescribe(', start + 1);
    return suite.slice(0, start) + (end === -1 ? '' : suite.slice(end + 1));
  })();

  /** Comments and strings blanked, lengths preserved so offsets stay comparable. */
  function codeOnly(source: string): string {
    const blank = (match: string) => ' '.repeat(match.length);
    return source
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/\/\/[^\n]*/g, blank)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
      .replace(/"(?:[^"\\\n]|\\.)*"/g, blank);
  }

  /**
   * Where the mutation-skipped block begins, found by regex.
   *
   * A string literal here would be byte-identical to the source, so a text
   * replacement could rewrite the marker and this test together and stay
   * consistent — which is how an earlier version of this test passed while the
   * guard had been removed entirely.
   */
  function guardIndex(source: string): number {
    return source.search(/describe\.skipIf\(\s*MUTATION_RUN\s*\)\(/);
  }

  it('keeps the real-repository block guarded, and last in the file', () => {
    const index = guardIndex(suite);
    expect(index, 'the mutation-run guard must still be here').toBeGreaterThan(-1);

    // Last, so "after the guard" is an unambiguous definition of guarded.
    const describes = [...suite.matchAll(/^describe[.(]/gm)].map((m) => m.index ?? -1);
    expect(Math.max(...describes)).toBe(index);
    expect(suite).toMatch(/const MUTATION_RUN = process\.env\.PLATFORM_MUTATION_RUN/);
  });

  it('runs the analyzer against the real tree only inside that block', () => {
    // `analyzeLatestChange()` with no options uses `process.cwd()` — the real
    // Follio tree. Every executed call must sit after the guard, or a mutated
    // analyzer could run against this repository. That is how a destructive
    // git command ran here once.
    const code = codeOnly(scanned);
    const index = guardIndex(code);
    expect(index, 'the guard must survive stripping').toBeGreaterThan(-1);

    const bare = [...code.matchAll(/analyzeLatestChange\(\s*\)/g)];
    expect(bare.length, 'the guarded block should still exercise the real tree').toBeGreaterThan(0);
    for (const match of bare) {
      expect(
        match.index ?? -1,
        `analyzeLatestChange() at offset ${match.index} is outside the guarded block`
      ).toBeGreaterThan(index);
    }
  });

  it('never lets a call outside that block reach the real tree with real git', () => {
    // The precise invariant, which a first attempt at this test got wrong: a
    // call is safe if it names a `repoRoot` (a temp directory) **or** passes
    // the `git` seam (which spawns nothing at all). Only a call with neither
    // uses `process.cwd()` and the real git binary.
    const code = codeOnly(scanned);
    const index = guardIndex(code);

    let checked = 0;
    for (const match of code.matchAll(/analyzeLatestChange\(\s*\{/g)) {
      if ((match.index ?? 0) > index) continue;
      checked += 1;
      // To the end of the options object, so a long seam literal is included.
      const tail = scanned.slice(match.index, (match.index ?? 0) + 600);
      expect(
        /repoRoot|git:/.test(tail),
        `call at ${match.index} names neither a repoRoot nor a git seam`
      ).toBe(true);
    }
    expect(checked, 'there should be calls outside the guarded block').toBeGreaterThan(0);
    expect(scanned).not.toMatch(/repoRoot:\s*process\.cwd\(\)/);
  });

  it('removes every throwaway repository it creates', () => {
    const code = codeOnly(scanned);
    const created = (code.match(/mkdtempSync\(/g) ?? []).length;
    const removed = (code.match(/rmSync\(/g) ?? []).length;

    expect(created, 'the suite should create temp repositories').toBeGreaterThan(0);
    expect(removed).toBe(created);
    expect(scanned).toContain('afterAll(');
    expect(scanned).toMatch(/recursive: true, force: true/);
  });

  it('never points a git command at the Follio working tree', () => {
    const cwds = [...codeOnly(scanned).matchAll(/cwd:\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(
      (m) => m[1]
    );

    expect(cwds.length, 'the suite should run git somewhere').toBeGreaterThan(0);
    for (const cwd of cwds) {
      expect(['repo', 'fresh'], `cwd ${cwd} is not a throwaway repository`).toContain(cwd);
    }
    expect(scanned).not.toMatch(/cwd:\s*process\.cwd\(\)/);
  });

  it('runs no repository-changing git verb outside a throwaway repository', () => {
    // The suite does use `git mv` and `git commit` — but only through helpers
    // bound to a temp `cwd`, which the test above pins.
    const code = codeOnly(scanned);
    const direct = [...code.matchAll(/(execFileSync|spawnSync)\(\s{0,4}/g)];

    expect(direct.length, 'the suite should spawn git somewhere').toBeGreaterThan(0);
    for (const match of direct) {
      const tail = scanned.slice(match.index, (match.index ?? 0) + 200);
      expect(tail, 'every direct git spawn must name a temp cwd').toMatch(/cwd:\s*(repo|fresh)/);
    }
  });
});

describe('no dependency and no product change', () => {
  it('imports nothing new from outside the platform', () => {
    const specifiers = new Set<string>();
    for (const file of [ANALYSIS, TYPES, PANEL, ROUTE]) {
      for (const match of read(file).matchAll(/from '([^']+)'/g)) specifiers.add(match[1]);
    }

    for (const specifier of specifiers) {
      const allowed =
        specifier.startsWith('.') ||
        specifier.startsWith('@/') ||
        ['node:child_process', 'node:fs', 'node:path', 'react', 'next/server'].includes(specifier);
      expect(allowed, `${specifier} is not an allowed import`).toBe(true);
    }
    expect(JSON.parse(read('package.json')).dependencies['simple-git']).toBeUndefined();
  });

  it('leaves the scanner, the coverage map and the schema alone', () => {
    // The analysis reads them; it may not redefine what drift is.
    const source = read(ANALYSIS);
    expect(source).not.toContain('runDriftScan');
    expect(source).not.toMatch(/writeFileSync|mkdirSync|rmSync|unlinkSync/);
  });
});

/**
 * Set by the mutation harness while a mutated analyzer is on disk.
 *
 * The decisive safety layer. A mutation run rewrites `change-analysis.ts`, and
 * an earlier mutation of this suite inserted a live checkout that the block
 * below executed against Follio, discarding uncommitted work. With this flag
 * the mutated analyzer is **never executed with the real repository as cwd**,
 * whatever the mutation happens to contain — the guarantee no longer depends
 * on recognising destructive text, which is exactly what failed before.
 *
 * The throwaway-repository block above still runs under mutation, so real-git
 * coverage is not lost: it can only ever touch a temp directory.
 */
const MUTATION_RUN = process.env.PLATFORM_MUTATION_RUN === '1';

describe.skipIf(MUTATION_RUN)('the real repository, end to end', () => {
  it('analyses HEAD without a seam', () => {
    const result = analyzeLatestChange();

    expect(result.error).toBeNull();
    expect(result.commit?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.commit?.shortSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(result.commit?.hasParent).toBe(true);
    expect(result.detail).toContain(result.commit?.shortSha ?? 'x');
  });

  it('accounts for every changed file exactly once', () => {
    const result = analyzeLatestChange();
    const mapped = new Set(result.features.flatMap((f) => f.matchedPaths));

    for (const file of result.files) {
      const isMapped = mapped.has(file.path);
      const isUnmapped = result.unmapped.includes(file.path);
      expect(isMapped !== isUnmapped, `${file.path} must be mapped xor unmapped`).toBe(true);
    }
    expect(result.summary.changedFiles).toBe(result.files.length);
    expect(result.summary.affectedFeatures).toBe(result.features.length);
  });

  it('names only features the live coverage map declares', () => {
    const known = new Set(COVERAGE_MAP.map((f) => f.id));

    for (const affected of analyzeLatestChange().features) {
      expect(known, `${affected.id} is not in the coverage map`).toContain(affected.id);
    }
  });

  it('reports coverage the map actually declares, not a derived guess', () => {
    for (const affected of analyzeLatestChange().features) {
      const mapped = COVERAGE_MAP.find((f) => f.id === affected.id);
      expect(affected.unitTests).toEqual(mapped?.unitTests ?? []);
      expect(affected.pathways.map((p) => p.id)).toEqual(mapped?.pathways ?? []);
    }
  });
});

/** Keeps the mocking import used, so lint does not flag it. */
void vi;
