import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { canRunDeveloperSuites } from '../../modules/developer/guard';
import { clearModuleGraphCache, clearSourceFactsCache, runDriftScan } from '../scan';
import type { DriftReport, DriftScanOptions, TestScanReport } from '../scan';
import type { ReachabilityScanReport, PathwayScanReport } from '../scan/types';
import { appendAuditEvent, auditPathFor, readAuditLog } from './audit';
import type { AuditDraft } from './audit';
import type {
  ActionOutcome,
  ActionResult,
  AuditAction,
  AuditResult,
  QuarantineCandidate,
  QuarantineRecord,
  QuarantineView,
} from './quarantine-types';
import { ELIGIBLE_GROUPS, QUARANTINE_FORMAT_VERSION } from './quarantine-types';

/**
 * Quarantine, then delete with approval (PLATFORM_TODO item 19).
 *
 * Server-only, and the only module in the platform that removes anything. The
 * order in item 19's line is the design:
 *
 *   finding → evidence → quarantine → typed approval → delete → audit
 *
 * There is no path from a finding to a delete. `deleteQuarantined` takes a
 * quarantine id, so a file that was never quarantined cannot be its argument.
 *
 * **The client never names a file.** Both entry points take a server-derived
 * id — `<signal>.<group>:<path>` for a candidate, an opaque uuid for a record —
 * and the path is resolved from a **freshly run scan** or from the stored
 * record. A path in a request body would be ignored, because there is no field
 * for one.
 *
 * **Three independent gates before anything moves.** The local-only developer
 * gate; membership in the current scan's candidate set, which is itself limited
 * to the four lists where the scan *proves* nothing reaches the file; and a
 * containment check that resolves the path, refuses `..`, refuses anything
 * outside the repository, follows symlinks with `realpathSync` and refuses a
 * protected prefix. Any one of them says no and nothing happens.
 *
 * **No shell, ever.** Node's `renameSync`, `rmSync` and `writeFileSync` do the
 * work. Nothing here spawns a process, and nothing here runs git — a test
 * asserts the module imports no `child_process` and names no git command.
 *
 * A quarantine deliberately may break the build: the file really is gone from
 * the tree. Nothing here edits an import or the coverage map to paper over
 * that, and the UI says so. Restoring is one call away, which is what makes
 * this reversible middle state worth having at all.
 */

/** Where quarantined payloads live, relative to the repository root. */
export const QUARANTINE_DIRNAME = path.join('_admin-panel', 'platform', '.quarantine');

/** The record inside a quarantine directory. */
const RECORD_FILENAME = 'record.json';

/** The subdirectory holding the file, at its original relative path. */
const PAYLOAD_DIRNAME = 'payload';

/**
 * Prefixes no destructive action may touch, whatever a scan says.
 *
 * The second belt. Eligibility already limits candidates to proven-unreachable
 * files, and none of these could be one — which is the point: a list that only
 * matters if something else has already gone wrong.
 */
const PROTECTED_PREFIXES: readonly string[] = [
  '.git/',
  '.github/',
  '.husky/',
  '.env',
  'node_modules/',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config',
  'vitest.config',
  'prisma/',
  '_admin-panel/platform/coverage-map/',
  '_admin-panel/platform/scan/',
  '_admin-panel/platform/drift/',
  '_admin-panel/platform/.quarantine/',
  '_admin-panel/platform/.audit/',
  '_admin-panel/platform/.runs/',
  '_admin-panel/modules/developer/guard.ts',
];

const toPosix = (value: string) => value.replace(/\\/g, '/');

/** True when a repo-relative path sits under something off limits. */
export function isProtectedPath(relativePath: string): boolean {
  const normalized = toPosix(relativePath).replace(/^\.\//, '');

  return PROTECTED_PREFIXES.some(
    (prefix) =>
      normalized === prefix.replace(/\/$/, '') ||
      normalized.startsWith(prefix) ||
      // A bare-file prefix such as `.env` also covers `.env.local`.
      (!prefix.endsWith('/') && normalized.startsWith(`${prefix}.`))
  );
}

/**
 * Candidates the current report proves unreachable.
 *
 * Pure: it reads the typed report and nothing else. The evidence on each one is
 * the scan's own, so a person approving a deletion reads why the scan thinks
 * nothing runs this file rather than taking the platform's word for it.
 */
export function quarantineCandidates(report: DriftReport): QuarantineCandidate[] {
  const candidates: QuarantineCandidate[] = [];
  const add = (signal: string, group: string, filePath: string, evidence: string[]) => {
    if (isProtectedPath(filePath)) return;
    candidates.push({
      id: `${signal}.${group}:${filePath}`,
      path: filePath,
      signal,
      group,
      evidence,
    });
  };

  const reachability = report.signals.find(
    (signal): signal is ReachabilityScanReport => signal.signal === 'reachability'
  );
  if (reachability) {
    for (const orphan of reachability.unrecordedOrphans) {
      add('reachability', 'unrecordedOrphans', orphan, [
        'No shipped entry point reaches this module.',
        `The graph walked ${reachability.summary.entryPoints} entry points over ${reachability.summary.modules} modules and never arrived here.`,
        'No reachability record in the map accounts for it.',
      ]);
    }
    for (const deadEnd of reachability.deadEnds) {
      add('reachability', 'deadEnds', deadEnd.path, [
        'An orphan that still has importers — every one of them itself an orphan.',
        `Imported by: ${deadEnd.importedBy.join(', ')}.`,
        'A reachable importer would have made it reachable, so the whole cluster is dead.',
      ]);
    }
  }

  const tests = report.signals.find(
    (signal): signal is TestScanReport => signal.signal === 'test-attribution'
  );
  if (tests) {
    for (const finding of tests.deadCode) {
      add('test-attribution', 'deadCode', finding.path, [
        'Every repo path this test reaches is recorded as an orphan.',
        `It reaches: ${[...finding.directTargets, ...finding.barrelTargets].join(', ')}.`,
        'So it covers code no shipped entry point can run.',
      ]);
    }
  }

  const pathways = report.signals.find(
    (signal): signal is PathwayScanReport => signal.signal === 'live-qa-pathways'
  );
  if (pathways) {
    for (const spec of pathways.orphanSpecs) {
      add('live-qa-pathways', 'orphanSpecs', spec, [
        'A Playwright spec under `pathways/` that no catalog entry names.',
        'Live QA runs pathways from the catalog, so nothing can ever run this file.',
      ]);
    }
  }

  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

export type QuarantineOptions = {
  repoRoot?: string;
  /** The quarantine store. Defaults to the gitignored directory in the repo. */
  root?: string;
  /** The audit store, passed through. Defaults beside the quarantine one. */
  auditRoot?: string;
  /** Gate result. Defaults to the real `canRunDeveloperSuites()`. */
  canRun?: boolean;
  /** `Admin.id` of whoever asked. Never an email and never a token. */
  actorId?: string | null;
  /** A pre-built report, so a test need not scan. Defaults to a fresh scan. */
  report?: DriftReport;
  /** Scanner seam. Defaults to the real `runDriftScan`. */
  scan?: (options?: DriftScanOptions) => DriftReport;
  now?: () => Date;
  /**
   * Drops the scanner's memoised graph after a mutation, so the next
   * revalidation sees the tree as it now is rather than as it was.
   */
  invalidate?: () => void;
};

function repoRootFor(options: QuarantineOptions): string {
  return options.repoRoot ?? process.cwd();
}

function quarantineRoot(options: QuarantineOptions): string {
  return options.root ?? path.join(repoRootFor(options), QUARANTINE_DIRNAME);
}

/** Repo-relative location of the store, for the UI to name. */
export function quarantineRootFor(): string {
  return toPosix(QUARANTINE_DIRNAME);
}

function sha256Of(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/**
 * Resolves a repo-relative path and refuses anything that leaves the tree.
 *
 * `path.resolve` collapses `..` before the check, so a traversal fails on the
 * prefix test rather than on a string match. `realpathSync` closes the symlink
 * route to the same escape: a link inside the repository pointing out of it
 * resolves outside and is refused.
 */
function resolveInsideRepo(
  relativePath: string,
  repoRoot: string
): { ok: true; absolute: string } | { ok: false; outcome: ActionOutcome; detail: string } {
  if (relativePath.length === 0 || relativePath.includes('\0')) {
    return { ok: false, outcome: 'outside-repository', detail: 'The path is not usable.' };
  }
  if (path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    return {
      ok: false,
      outcome: 'outside-repository',
      detail: 'An absolute path is never accepted; targets are resolved from the scan.',
    };
  }

  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    return {
      ok: false,
      outcome: 'outside-repository',
      detail: 'The path resolves outside the repository.',
    };
  }

  if (existsSync(absolute)) {
    let real: string;
    try {
      real = realpathSync(absolute);
    } catch {
      return {
        ok: false,
        outcome: 'outside-repository',
        detail: 'The path could not be resolved.',
      };
    }

    let realRoot = root;
    try {
      realRoot = realpathSync(root);
    } catch {
      realRoot = root;
    }
    if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
      return {
        ok: false,
        outcome: 'outside-repository',
        detail: 'The path is a link that points outside the repository.',
      };
    }
  }

  return { ok: true, absolute };
}

function audit(
  action: AuditAction,
  result: AuditResult,
  draft: Omit<AuditDraft, 'action' | 'result'>,
  options: QuarantineOptions
): string | null {
  const event = appendAuditEvent(
    { action, result, ...draft },
    { repoRoot: options.repoRoot, root: options.auditRoot, now: options.now }
  );

  return event?.id ?? null;
}

function refuse(
  action: AuditAction,
  outcome: ActionOutcome,
  detail: string,
  context: {
    path: string;
    quarantineId?: string | null;
    signal?: string | null;
    group?: string | null;
    evidence?: string[];
    actorId?: string | null;
  },
  options: QuarantineOptions
): ActionResult {
  // A refusal is part of the trail: "what happened to that file" is answered
  // by the refusals as often as by the deletions.
  const auditId = audit(
    action,
    'refused',
    {
      path: context.path,
      quarantineId: context.quarantineId ?? null,
      signal: context.signal ?? null,
      group: context.group ?? null,
      evidence: context.evidence ?? [],
      sha256Before: null,
      sha256After: null,
      approval: null,
      actorId: options.actorId ?? null,
      reason: `${outcome}: ${detail}`,
    },
    options
  );

  return { outcome, detail, record: null, auditId };
}

function recordFile(root: string, id: string): string {
  return path.join(root, id, RECORD_FILENAME);
}

function readRecord(root: string, id: string): QuarantineRecord | null {
  const file = recordFile(root, id);
  if (!existsSync(file)) return null;

  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as QuarantineRecord;
    if (value.version !== QUARANTINE_FORMAT_VERSION) return null;
    if (typeof value.id !== 'string' || typeof value.originalPath !== 'string') return null;

    return value;
  } catch {
    return null;
  }
}

function writeRecord(root: string, record: QuarantineRecord): void {
  mkdirSync(path.join(root, record.id), { recursive: true });
  writeFileSync(recordFile(root, record.id), JSON.stringify(record, null, 2), 'utf8');
}

/** Every record in the store, newest first. Includes deleted and restored. */
export function listQuarantine(options: QuarantineOptions = {}): QuarantineRecord[] {
  const root = quarantineRoot(options);
  if (!existsSync(root)) return [];

  let ids: string[];
  try {
    ids = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  return ids
    .map((id) => readRecord(root, id))
    .filter((record): record is QuarantineRecord => record !== null)
    .sort((a, b) =>
      a.quarantinedAt === b.quarantinedAt ? 0 : a.quarantinedAt < b.quarantinedAt ? 1 : -1
    );
}

/**
 * Moves one candidate out of the tree.
 *
 * The id is re-resolved against a scan run **now**, so a finding that has gone
 * away since the page was rendered is refused rather than acted on. The move
 * is a `renameSync` — the same bytes, not a copy — and the hash is taken before
 * and checked after.
 */
export function quarantineCandidate(
  candidateId: string,
  options: QuarantineOptions = {}
): ActionResult {
  const repoRoot = repoRootFor(options);
  const root = quarantineRoot(options);

  if (!(options.canRun ?? canRunDeveloperSuites())) {
    return refuse(
      'quarantine',
      'gate-closed',
      'Quarantine is local-only: it needs DEVTOOLS_ENABLED=true and is refused in production.',
      { path: candidateId },
      options
    );
  }

  // Revalidated against the repository as it is right now, not as the page saw
  // it. The path comes from this result; the id is only a lookup key.
  const report = options.report ?? (options.scan ?? runDriftScan)({ repoRoot });
  const candidate = quarantineCandidates(report).find((entry) => entry.id === candidateId);

  if (candidate === undefined) {
    return refuse(
      'quarantine',
      'stale-finding',
      'This scan has no such finding. Reload the drift page and review it again.',
      { path: candidateId },
      options
    );
  }
  if (isProtectedPath(candidate.path)) {
    return refuse(
      'quarantine',
      'protected-path',
      'That path is protected and no destructive action may touch it.',
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }

  const resolved = resolveInsideRepo(candidate.path, repoRoot);
  if (!resolved.ok) {
    return refuse(
      'quarantine',
      resolved.outcome,
      resolved.detail,
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }
  if (!existsSync(resolved.absolute) || !statSync(resolved.absolute).isFile()) {
    return refuse(
      'quarantine',
      'missing-file',
      'The candidate is not a file on disk any more.',
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }

  const id = randomUUID();
  const sha256 = sha256Of(resolved.absolute);
  const bytes = statSync(resolved.absolute).size;
  // The payload keeps its original relative path inside the run's own
  // directory, so two files of the same name never collide and a restore is a
  // single rename back.
  const payloadRelative = path.join(id, PAYLOAD_DIRNAME, candidate.path);
  const payloadAbsolute = path.join(root, payloadRelative);

  const inside = path.resolve(root);
  if (!path.resolve(payloadAbsolute).startsWith(`${inside}${path.sep}`)) {
    return refuse(
      'quarantine',
      'outside-repository',
      'The quarantine destination would sit outside the quarantine root.',
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }

  try {
    mkdirSync(path.dirname(payloadAbsolute), { recursive: true });
    renameSync(resolved.absolute, payloadAbsolute);
  } catch (error) {
    return refuse(
      'quarantine',
      'failed',
      `The file could not be moved: ${error instanceof Error ? error.message : 'unknown error'}. Nothing was changed.`,
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }

  const record: QuarantineRecord = {
    version: QUARANTINE_FORMAT_VERSION,
    id,
    originalPath: toPosix(candidate.path),
    payloadPath: toPosix(path.join(QUARANTINE_DIRNAME, payloadRelative)),
    state: 'quarantined',
    sha256,
    bytes,
    signal: candidate.signal,
    group: candidate.group,
    evidence: candidate.evidence,
    quarantinedAt: (options.now ?? (() => new Date()))().toISOString(),
    actorId: options.actorId ?? null,
    approvalRequired: `To delete this, send its original path back exactly: ${toPosix(candidate.path)}`,
  };

  try {
    const moved = sha256Of(payloadAbsolute);
    if (moved !== sha256) throw new Error('the moved file does not match its hash');
    writeRecord(root, record);
  } catch (error) {
    // Put it back. A payload nobody has a record of would be worse than a
    // refused action, because nothing would know where it came from.
    try {
      renameSync(payloadAbsolute, resolved.absolute);
    } catch {
      // Both moves failed; the audit line below is the only trace, and it
      // names the payload so a person can find it by hand.
    }

    return refuse(
      'quarantine',
      'failed',
      `The move was undone: ${error instanceof Error ? error.message : 'unknown error'}.`,
      { path: candidate.path, signal: candidate.signal, group: candidate.group },
      options
    );
  }

  options.invalidate?.();

  const auditId = audit(
    'quarantine',
    'ok',
    {
      path: record.originalPath,
      quarantineId: id,
      signal: candidate.signal,
      group: candidate.group,
      evidence: candidate.evidence,
      sha256Before: sha256,
      sha256After: sha256,
      approval: null,
      actorId: options.actorId ?? null,
      reason: null,
    },
    options
  );

  return {
    outcome: 'quarantined',
    detail: `Moved out of the tree. The build may now fail where something still imports it — that is the point of the middle state. ${record.approvalRequired}`,
    record,
    auditId,
  };
}

/**
 * Deletes a quarantined payload, and only with the original path typed back.
 *
 * The second request. It cannot be reached from a finding: the argument is a
 * quarantine id, so a file that was never quarantined has no id to pass. The
 * approval is checked here, on the server, against the stored record — not by a
 * disabled button and not by a browser dialog.
 *
 * One target. Nothing walks a directory, nothing follows an import, and the
 * coverage map is not touched.
 */
export function deleteQuarantined(
  quarantineId: string,
  confirmation: string,
  options: QuarantineOptions = {}
): ActionResult {
  const root = quarantineRoot(options);

  if (!(options.canRun ?? canRunDeveloperSuites())) {
    return refuse(
      'delete',
      'gate-closed',
      'Deleting is local-only: it needs DEVTOOLS_ENABLED=true and is refused in production.',
      { path: quarantineId, quarantineId },
      options
    );
  }

  const record = readRecord(root, quarantineId);
  if (record === null) {
    return refuse(
      'delete',
      'unknown-record',
      'No quarantine record with that id. Nothing was deleted.',
      { path: quarantineId, quarantineId },
      options
    );
  }
  if (record.state !== 'quarantined' || record.payloadPath === null) {
    return refuse(
      'delete',
      record.state === 'deleted' ? 'already-deleted' : 'payload-changed',
      record.state === 'deleted'
        ? 'That artifact was already deleted. The record stays as provenance.'
        : 'That artifact is no longer in quarantine, so there is nothing to delete.',
      {
        path: record.originalPath,
        quarantineId,
        signal: record.signal,
        group: record.group,
      },
      options
    );
  }

  if (confirmation.length === 0) {
    return refuse(
      'delete',
      'approval-missing',
      'A deletion needs the artifact’s original path sent back as approval.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }
  // Compared to the stored record, never to anything the caller also supplied.
  if (confirmation.trim() !== record.originalPath) {
    return refuse(
      'delete',
      'approval-mismatch',
      'The approval did not match this artifact’s original path. Nothing was deleted.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const payloadAbsolute = path.join(repoRootFor(options), record.payloadPath);
  const payloadInStore = options.root
    ? path.join(root, record.id, PAYLOAD_DIRNAME, record.originalPath)
    : payloadAbsolute;

  if (!existsSync(payloadInStore)) {
    return refuse(
      'delete',
      'payload-changed',
      'The quarantined file is not where its record says it is. Nothing was deleted.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const current = sha256Of(payloadInStore);
  if (current !== record.sha256) {
    return refuse(
      'delete',
      'payload-changed',
      'The quarantined bytes no longer match the hash recorded when it was moved. Nothing was deleted; review it again.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  try {
    // One file. Not its directory, not its neighbours, not its imports.
    rmSync(payloadInStore, { force: true });
  } catch (error) {
    return refuse(
      'delete',
      'failed',
      `The file could not be removed: ${error instanceof Error ? error.message : 'unknown error'}.`,
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const deleted: QuarantineRecord = {
    ...record,
    state: 'deleted',
    payloadPath: null,
    deletedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  writeRecord(root, deleted);

  const auditId = audit(
    'delete',
    'ok',
    {
      path: record.originalPath,
      quarantineId,
      signal: record.signal,
      group: record.group,
      evidence: record.evidence,
      sha256Before: record.sha256,
      sha256After: null,
      // A label, not the value the caller sent.
      approval: 'original-path-confirmed',
      actorId: options.actorId ?? null,
      reason: null,
    },
    options
  );

  return {
    outcome: 'deleted',
    detail: `Deleted. The record and the audit line stay, so what was removed and why is still answerable.`,
    record: deleted,
    auditId,
  };
}

/**
 * Puts a quarantined file back where it came from.
 *
 * Quarantine is only a safe middle state if it can be undone; without this it
 * would be a slow delete, and the two-stage design would mean nothing. It
 * restores to the recorded path and nowhere else, refuses if something now
 * occupies that path, checks the hash first, and is audited like the rest.
 */
export function restoreQuarantined(
  quarantineId: string,
  options: QuarantineOptions = {}
): ActionResult {
  const repoRoot = repoRootFor(options);
  const root = quarantineRoot(options);

  if (!(options.canRun ?? canRunDeveloperSuites())) {
    return refuse(
      'restore',
      'gate-closed',
      'Restoring is local-only: it needs DEVTOOLS_ENABLED=true and is refused in production.',
      { path: quarantineId, quarantineId },
      options
    );
  }

  const record = readRecord(root, quarantineId);
  if (record === null) {
    return refuse(
      'restore',
      'unknown-record',
      'No quarantine record with that id.',
      { path: quarantineId, quarantineId },
      options
    );
  }
  if (record.state !== 'quarantined' || record.payloadPath === null) {
    return refuse(
      'restore',
      record.state === 'deleted' ? 'already-deleted' : 'payload-changed',
      record.state === 'deleted'
        ? 'That artifact was deleted. A deletion is not reversible from here.'
        : 'That artifact is not in quarantine.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const destination = resolveInsideRepo(record.originalPath, repoRoot);
  if (!destination.ok) {
    return refuse(
      'restore',
      destination.outcome,
      destination.detail,
      { path: record.originalPath, quarantineId },
      options
    );
  }
  if (existsSync(destination.absolute)) {
    return refuse(
      'restore',
      'destination-occupied',
      'Something now occupies that path. Nothing was overwritten.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const payloadInStore = path.join(root, record.id, PAYLOAD_DIRNAME, record.originalPath);
  if (!existsSync(payloadInStore) || sha256Of(payloadInStore) !== record.sha256) {
    return refuse(
      'restore',
      'payload-changed',
      'The quarantined file is missing or no longer matches its hash.',
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  try {
    mkdirSync(path.dirname(destination.absolute), { recursive: true });
    renameSync(payloadInStore, destination.absolute);
  } catch (error) {
    return refuse(
      'restore',
      'failed',
      `The file could not be put back: ${error instanceof Error ? error.message : 'unknown error'}.`,
      { path: record.originalPath, quarantineId, signal: record.signal, group: record.group },
      options
    );
  }

  const restored: QuarantineRecord = {
    ...record,
    state: 'restored',
    payloadPath: null,
    restoredAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  writeRecord(root, restored);
  options.invalidate?.();

  const auditId = audit(
    'restore',
    'ok',
    {
      path: record.originalPath,
      quarantineId,
      signal: record.signal,
      group: record.group,
      evidence: record.evidence,
      sha256Before: record.sha256,
      sha256After: record.sha256,
      approval: null,
      actorId: options.actorId ?? null,
      reason: null,
    },
    options
  );

  return {
    outcome: 'restored',
    detail: `Put back at ${record.originalPath}, byte for byte.`,
    record: restored,
    auditId,
  };
}

const GATE_REASON =
  'Quarantine and delete are local-only: they are refused in production and need DEVTOOLS_ENABLED=true elsewhere. The candidates and the audit trail below are read-only and always visible.';

/**
 * Everything the destructive panel renders.
 *
 * Read-only: it runs the scan, reads the store and reads the trail. The page
 * calls this once per render, so the candidate list is as current as the rest
 * of the drift report beside it.
 */
export function buildQuarantineView(
  options: QuarantineOptions & { auditLimit?: number } = {}
): QuarantineView {
  const report =
    options.report ?? (options.scan ?? runDriftScan)({ repoRoot: repoRootFor(options) });

  return {
    version: QUARANTINE_FORMAT_VERSION,
    quarantineRoot: quarantineRootFor(),
    auditPath: auditPathFor(),
    canAct: options.canRun ?? canRunDeveloperSuites(),
    gateReason: GATE_REASON,
    candidates: quarantineCandidates(report),
    records: listQuarantine(options),
    audit: readAuditLog({
      repoRoot: options.repoRoot,
      root: options.auditRoot,
      limit: options.auditLimit ?? 25,
    }),
  };
}

/**
 * Drops the scanner's memoised passes, so the next scan sees the new tree.
 *
 * Both passes are memoised per repository root for the sake of one CLI run;
 * after a file has moved, a cached graph would still list it. The routes call
 * this once a mutation has happened, which is what makes the next
 * revalidation trustworthy.
 */
export function invalidateScannerCaches(): void {
  clearModuleGraphCache();
  clearSourceFactsCache();
}

/** Repo-relative location of the audit trail, for the UI to name. */
export { auditPathFor };
