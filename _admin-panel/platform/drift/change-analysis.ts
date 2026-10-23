/**
 * Recent change analysis — reading the latest commit (PLATFORM_TODO: Drift
 * intelligence, step 1).
 *
 * **Server-only**: spawns git. `change-types.ts` is the client-safe half and
 * is what `platform/ui` imports.
 *
 * ## Git safety
 *
 * Read-only, and structurally so. Every command is a fixed `argv` array passed
 * to `spawnSync` with **no shell**, so there is nothing for an argument to
 * escape into, and the argv is a literal in this file rather than anything a
 * caller supplies. The browser sends no git input at all — not a range, not a
 * sha, not a path — because this step supports exactly one analysis: `HEAD`.
 * That is why `analyzeLatestChange` takes no commit parameter; adding ranges
 * later means adding a validated, server-side allowlist, not a passthrough.
 *
 * Only `rev-parse`, `log` and `show` are ever run. Nothing here checks out,
 * resets, cleans, stashes, adds, commits, restores, merges or rebases, and
 * nothing writes to the repository, the index or the working tree.
 *
 * The same contract `platform/tests/history.ts` already uses for `readCommit`
 * — array argv, `windowsHide`, status checked, output shape validated — is
 * followed here deliberately rather than reinvented.
 *
 * ## Why `--name-status -z`
 *
 * Machine-readable rather than human-formatted. `-z` makes records
 * NUL-separated, so a path containing a space, a quote or non-ASCII arrives
 * intact instead of being git-quoted. The record shapes were verified against
 * real git output:
 *
 *     A\0added.ts\0            M\0keep.ts\0            R100\0old/a.ts\0new-a.ts\0
 *
 * A rename or copy carries **two** paths; everything else carries one.
 *
 * ## Mapping
 *
 * `featuresCovering` from `platform/scan/surface.ts` does the owning — the
 * same single implementation every drift signal uses. This module builds no
 * second feature inventory and no second notion of "which feature owns this
 * file". For a rename, both the old and the new path are offered to it, so a
 * feature that still declares the old path is found.
 */

import { spawnSync } from 'node:child_process';

import { LIVE_QA_PATHWAYS } from '../../modules/developer/live-qa/catalog';
import { COVERAGE_MAP } from '../coverage-map';
import type { PlatformFeature } from '../coverage-map';
import { featuresCovering } from '../scan/surface';

import type {
  AffectedFeature,
  AffectedPathway,
  AnalyzedCommit,
  ChangeAnalysis,
  ChangeAnalysisError,
  ChangedFile,
  ChangeStatus,
} from './change-types';

/**
 * Field separator for the `log` format.
 *
 * `%x00` is git's own escape: it is passed through as those four characters
 * and git emits a real NUL. A literal NUL cannot be put in the argument — argv
 * entries are NUL-terminated, and Node rejects the string outright — so the
 * escape is the only way to get an unambiguous separator into the output. A
 * commit subject can contain anything else, including tabs and pipes.
 */
const UNIT_ESCAPE = '%x00';
const UNIT = '\u0000';

export type ChangeAnalysisOptions = {
  repoRoot?: string;
  features?: PlatformFeature[];
  /** Seam for tests: runs git and returns its result. Never takes a shell. */
  git?: GitRunner;
};

export type GitResult = { status: number | null; stdout: string };

/**
 * Runs one fixed git command.
 *
 * The seam exists so tests can drive the parser and the mapper with recorded
 * git output instead of needing a repository shaped a particular way. The real
 * implementation is the only thing that ever spawns.
 */
export type GitRunner = (args: string[]) => GitResult;

function realGit(repoRoot: string): GitRunner {
  return (args) => {
    const result = spawnSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      // A commit touching thousands of files should truncate, not wedge.
      maxBuffer: 8 * 1024 * 1024,
    });
    return { status: result.status, stdout: `${result.stdout ?? ''}` };
  };
}

/** Maps git's status code to the vocabulary in `change-types.ts`. */
export function toChangeStatus(code: string): ChangeStatus {
  switch (code.charAt(0)) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'type-changed';
    default:
      return 'other';
  }
}

/**
 * Parses `git show --name-status -z` output.
 *
 * Walks NUL-separated fields, taking one path normally and two after a rename
 * or copy. A trailing partial record — which is what a truncated `maxBuffer`
 * looks like — is dropped rather than half-read.
 */
export function parseNameStatus(stdout: string): ChangedFile[] {
  const fields = stdout.split('\0').filter((field) => field !== '');
  const files: ChangedFile[] = [];

  for (let i = 0; i < fields.length; ) {
    const code = fields[i];
    const status = toChangeStatus(code);
    const takesTwo = status === 'renamed' || status === 'copied';

    if (takesTwo) {
      if (i + 2 >= fields.length) break;
      files.push({ path: fields[i + 2], status, code, previousPath: fields[i + 1] });
      i += 3;
      continue;
    }

    if (i + 1 >= fields.length) break;
    files.push({ path: fields[i + 1], status, code, previousPath: null });
    i += 2;
  }

  return files;
}

/** Resolves a feature's declared pathway ids against the Live QA catalog. */
function resolvePathways(ids: string[]): AffectedPathway[] {
  return ids.map((id) => {
    const pathway = LIVE_QA_PATHWAYS.find((entry) => entry.id === id);
    return {
      id,
      title: pathway?.title ?? null,
      spec: pathway?.spec ?? null,
    };
  });
}

/** Every path a changed file should be matched by — new and, for a rename, old. */
function pathsFor(file: ChangedFile): string[] {
  return file.previousPath === null ? [file.path] : [file.path, file.previousPath];
}

function failure(error: ChangeAnalysisError, detail: string): ChangeAnalysis {
  return {
    commit: null,
    files: [],
    features: [],
    unmapped: [],
    summary: {
      changedFiles: 0,
      affectedFeatures: 0,
      unmappedFiles: 0,
      featuresWithoutTests: 0,
      featuresWithoutPathways: 0,
    },
    error,
    detail,
  };
}

/** Reads HEAD's sha, short sha and subject. Null when git cannot say. */
export function readLatestCommit(git: GitRunner): AnalyzedCommit | null {
  const log = git([
    'log',
    '-1',
    '--no-color',
    `--format=%H${UNIT_ESCAPE}%h${UNIT_ESCAPE}%s`,
    'HEAD',
  ]);
  if (log.status !== 0) return null;

  const [sha, shortSha, ...rest] = log.stdout.replace(/\n$/, '').split(UNIT);
  if (!/^[0-9a-f]{40}$/.test(`${sha}`)) return null;

  // `--verify -q HEAD^` exits non-zero on the repository's first commit, which
  // is how a root commit is detected without parsing an error message.
  const parent = git(['rev-parse', '--verify', '-q', 'HEAD^']);

  return {
    sha,
    shortSha: `${shortSha}`,
    subject: rest.join(UNIT),
    hasParent: parent.status === 0,
  };
}

/**
 * Analyses the latest commit against the coverage map.
 *
 * Takes no commit argument on purpose — see the git-safety note above.
 */
export function analyzeLatestChange(options: ChangeAnalysisOptions = {}): ChangeAnalysis {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const git = options.git ?? realGit(repoRoot);

  let inside: GitResult;
  try {
    inside = git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return failure('git-unavailable', 'git could not be run, so no commit could be read.');
  }
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return failure('not-a-repository', 'This directory is not a git work tree.');
  }

  let commit: AnalyzedCommit | null;
  try {
    commit = readLatestCommit(git);
  } catch {
    return failure('read-failed', 'git failed while reading the latest commit.');
  }
  if (commit === null) {
    return failure('no-commits', 'The repository has no commit to analyse yet.');
  }

  // On a root commit `git show` lists the whole tree as added, which is the
  // honest answer for "what did this commit change" and needs no special case.
  let shown: GitResult;
  try {
    shown = git([
      'show',
      '--no-color',
      '--name-status',
      '--find-renames',
      '--format=',
      '-z',
      'HEAD',
    ]);
  } catch {
    return failure('read-failed', 'git failed while listing the commit’s files.');
  }
  if (shown.status !== 0) {
    return failure('read-failed', 'git could not list the files in the latest commit.');
  }

  const files = parseNameStatus(shown.stdout);

  // One pass: every file either maps to features or is unmapped. The matched
  // paths and locations are collected per feature so the panel can show *why*
  // a feature is here rather than asking the reader to trust it.
  const byFeature = new Map<string, { paths: Set<string>; locations: Set<string> }>();
  const unmapped: string[] = [];

  for (const file of files) {
    const targets = pathsFor(file);
    const owners = featuresCovering(targets, features);

    if (owners.length === 0) {
      unmapped.push(file.path);
      continue;
    }

    for (const id of owners) {
      const entry = byFeature.get(id) ?? { paths: new Set(), locations: new Set() };
      entry.paths.add(file.path);
      const feature = features.find((candidate) => candidate.id === id);
      for (const location of feature?.codeLocations ?? []) {
        if (targets.some((target) => target === location || target.startsWith(`${location}/`))) {
          entry.locations.add(location);
        }
      }
      byFeature.set(id, entry);
    }
  }

  const affected: AffectedFeature[] = [...byFeature.entries()]
    .map(([id, matched]) => {
      const feature = features.find((candidate) => candidate.id === id);
      return {
        id,
        name: feature?.name ?? id,
        category: feature?.category ?? '',
        featureStatus: feature?.status ?? '',
        matchedPaths: [...matched.paths].sort(),
        matchedLocations: [...matched.locations].sort(),
        unitTests: [...(feature?.unitTests ?? [])],
        pathways: resolvePathways(feature?.pathways ?? []),
        labId: feature?.lab ?? null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedUnmapped = [...new Set(unmapped)].sort();

  return {
    commit,
    files,
    features: affected,
    unmapped: sortedUnmapped,
    summary: {
      changedFiles: files.length,
      affectedFeatures: affected.length,
      unmappedFiles: sortedUnmapped.length,
      featuresWithoutTests: affected.filter((feature) => feature.unitTests.length === 0).length,
      featuresWithoutPathways: affected.filter((feature) => feature.pathways.length === 0).length,
    },
    error: null,
    detail: describe(files.length, affected.length, sortedUnmapped.length, commit),
  };
}

function describe(
  changed: number,
  affected: number,
  unmapped: number,
  commit: AnalyzedCommit
): string {
  if (changed === 0) {
    return `${commit.shortSha} changed no files that git reports.`;
  }

  const root = commit.hasParent ? '' : ' It is the first commit, so every file counts as added.';
  const owned = affected === 1 ? '1 mapped feature' : `${affected} mapped features`;
  const files = changed === 1 ? '1 file' : `${changed} files`;
  const tail =
    unmapped === 0
      ? 'Every changed file is claimed by the coverage map.'
      : `${unmapped} changed ${unmapped === 1 ? 'file is' : 'files are'} not claimed by any feature.`;

  return `${commit.shortSha} changed ${files}, touching ${owned}. ${tail}${root}`;
}
