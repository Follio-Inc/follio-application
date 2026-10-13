/**
 * Quarantine, delete and the audit trail (PLATFORM_TODO item 19).
 *
 * Client-safe: types and constants only. No `node:` import, nothing that can
 * move or remove a file.
 *
 * Item 19's line is "quarantine, then delete with approval and an audit
 * record", and the order is the whole design. A finding never reaches a delete:
 * it has to be quarantined first, which moves the file out of the tree and
 * records what it was; deleting it then needs a second request carrying the
 * original path typed back as approval. Both leave an audit record, and the
 * audit outlives the thing it describes.
 *
 * Eligibility is narrow on purpose. Item 8's own note warned that a scan which
 * cannot tell `orphan` from `module-reachable-call-unused` "is not safe to act
 * on, and item 19 would quarantine live code" — so the only candidates are
 * **files the scan proves nothing reaches**. A module something imports is not
 * a candidate even if nothing calls it, an unmapped page is not a candidate
 * because nobody has decided what it is, and ambiguity always resolves to
 * leaving the file alone.
 */

/** Format version of a stored record or audit line. */
export const QUARANTINE_FORMAT_VERSION = 1;

/**
 * The report lists whose findings are files the scan proves unreachable.
 *
 * - `reachability.unrecordedOrphans` — no shipped entry point reaches it.
 * - `reachability.deadEnds` — imported only by code that is itself an orphan.
 * - `test-attribution.deadCode` — a test whose every target is orphaned.
 * - `live-qa-pathways.orphanSpecs` — a spec no catalog entry names, so it can
 *   never run.
 *
 * Deliberately absent: `reachability.unrecordedCallUnused`, because something
 * does import it; `map-references.orphaned`, because a feature still claims
 * that path and retiring it starts with its owner; `product-surface.unmapped`,
 * because nobody has decided what it is; and every stale reference, because the
 * fix there is a map edit, which is item 18's business.
 */
export const ELIGIBLE_GROUPS: readonly string[] = [
  'reachability.unrecordedOrphans',
  'reachability.deadEnds',
  'test-attribution.deadCode',
  'live-qa-pathways.orphanSpecs',
];

/** One file the current scan says is a candidate for retirement. */
export type QuarantineCandidate = {
  /** `<signal>.<group>:<path>`. Server-derived; the only handle a client gets. */
  id: string;
  /** Repo-relative path. Derived here, never accepted from a caller. */
  path: string;
  signal: string;
  group: string;
  /** Why the scan says nothing reaches it. */
  evidence: string[];
};

export type QuarantineState = 'quarantined' | 'deleted' | 'restored';

/**
 * What was quarantined, and everything needed to review, delete or restore it.
 *
 * Holds no file contents and no secret: a hash, a size, the paths, the finding
 * that motivated it, and the admin row id of whoever acted.
 */
export type QuarantineRecord = {
  version: number;
  /** Opaque, generated on the server. */
  id: string;
  /** Where the file came from, repo-relative. The one path a delete confirms. */
  originalPath: string;
  /** Where the payload sits, repo-relative. Null once deleted or restored. */
  payloadPath: string | null;
  state: QuarantineState;
  /** SHA-256 of the contents when it was moved. Checked again before a delete. */
  sha256: string;
  bytes: number;
  /** The signal and list that made it a candidate. */
  signal: string;
  group: string;
  evidence: string[];
  quarantinedAt: string;
  /** `Admin.id` — not a Clerk id, not an email, never a token. */
  actorId: string | null;
  /** What a person must do before this can be deleted, in words. */
  approvalRequired: string;
  deletedAt?: string;
  restoredAt?: string;
};

export type AuditAction = 'quarantine' | 'delete' | 'restore';

/** Whether the attempt did what it set out to do. Refusals are recorded too. */
export type AuditResult = 'ok' | 'refused' | 'failed';

/**
 * One line of the audit trail.
 *
 * Append-only from the platform's side: nothing in the UI or the API edits or
 * removes a line, and a deleted artifact leaves its trail behind.
 */
export type AuditEvent = {
  version: number;
  id: string;
  at: string;
  action: AuditAction;
  result: AuditResult;
  /** Repo-relative target. */
  path: string;
  quarantineId: string | null;
  signal: string | null;
  group: string | null;
  /** A short summary of the evidence, not the file. */
  evidence: string[];
  sha256Before: string | null;
  sha256After: string | null;
  /**
   * How the delete was approved, as a label — `original-path-confirmed`.
   * Never the submitted value, and never anything from the request body.
   */
  approval: string | null;
  actorId: string | null;
  /** Why a refusal or failure happened. Null on success. */
  reason: string | null;
};

/**
 * What came of an attempt.
 *
 * - `quarantined` / `deleted` / `restored` — it happened.
 * - `not-eligible` — the path is not in the current scan's candidate set.
 * - `stale-finding` — the id named a finding this scan no longer has.
 * - `protected-path` — inside a path no destructive action may touch.
 * - `outside-repository` — resolved outside the repo, or through a symlink.
 * - `missing-file` — the candidate is no longer on disk.
 * - `unknown-record` — no quarantine record with that id.
 * - `already-deleted` — the payload is gone; the record stays as provenance.
 * - `approval-missing` / `approval-mismatch` — the delete was not approved.
 * - `payload-changed` — the quarantined bytes no longer match the record.
 * - `destination-occupied` — a restore would overwrite a file that now exists.
 * - `gate-closed` — `canRunDeveloperSuites()` said no.
 * - `failed` — the filesystem refused; the tree was left as it was.
 */
export type ActionOutcome =
  | 'quarantined'
  | 'deleted'
  | 'restored'
  | 'not-eligible'
  | 'stale-finding'
  | 'protected-path'
  | 'outside-repository'
  | 'missing-file'
  | 'unknown-record'
  | 'already-deleted'
  | 'approval-missing'
  | 'approval-mismatch'
  | 'payload-changed'
  | 'destination-occupied'
  | 'gate-closed'
  | 'failed';

export type ActionResult = {
  outcome: ActionOutcome;
  /** One sentence an operator can act on. Always present. */
  detail: string;
  /** The record, when the action produced or touched one. */
  record: QuarantineRecord | null;
  /** The audit line this attempt wrote, when it wrote one. */
  auditId: string | null;
};

/** Everything the destructive panel renders. */
export type QuarantineView = {
  version: number;
  /** Repo-relative store locations, so an operator can go and look. */
  quarantineRoot: string;
  auditPath: string;
  /** Whether destructive actions are available here at all. */
  canAct: boolean;
  /** Why not, when `canAct` is false. */
  gateReason: string;
  /** Files the current scan proves unreachable. */
  candidates: QuarantineCandidate[];
  /** Records, newest first. Includes deleted and restored ones. */
  records: QuarantineRecord[];
  /** Audit lines, newest first. Read-only. */
  audit: AuditEvent[];
};
