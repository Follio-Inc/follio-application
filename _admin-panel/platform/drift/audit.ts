import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { AuditEvent } from './quarantine-types';
import { QUARANTINE_FORMAT_VERSION } from './quarantine-types';

/**
 * The audit trail for destructive actions (PLATFORM_TODO item 19).
 *
 * Server-only, and deliberately the dullest module in the platform: one
 * `appendFileSync` of one JSON line per attempt, and a reader that skips what
 * it cannot parse. There is no update and no delete — not as a policy, but
 * because no function here can do either. The only write is an append.
 *
 * Local and gitignored, beside item 16's run history. Not Prisma: this is
 * operator state about a local working tree, and a destructive action on one
 * machine is not a fact about the product.
 *
 * **Every attempt is recorded, including the refusals.** A quarantine that was
 * refused because the finding went stale, and a delete refused because the
 * approval did not match, are exactly the lines a person wants when they come
 * back asking what happened to a file.
 *
 * Nothing in a line can be a secret: the writer takes a fixed set of fields,
 * so a request body, an environment value or a token has no way in. A test
 * asserts the file contains no Clerk id, no email and no token shape after a
 * full quarantine-and-delete cycle.
 */

/** Where the trail lives, relative to the repository root. */
export const AUDIT_DIRNAME = path.join('_admin-panel', 'platform', '.audit');

/** One file, versioned in its name, so a format change cannot corrupt a trail. */
export const AUDIT_FILENAME = `audit-v${QUARANTINE_FORMAT_VERSION}.jsonl`;

export type AuditOptions = {
  repoRoot?: string;
  /** The trail's directory. Defaults to the gitignored one in the repo. */
  root?: string;
  now?: () => Date;
};

function auditRoot(options: AuditOptions): string {
  return options.root ?? path.join(options.repoRoot ?? process.cwd(), AUDIT_DIRNAME);
}

/** Repo-relative location of the trail, for the UI to name. */
export function auditPathFor(options: AuditOptions = {}): string {
  return path.join(AUDIT_DIRNAME, AUDIT_FILENAME).replace(/\\/g, '/');
}

/** What a caller supplies. The rest of the line is this module's business. */
export type AuditDraft = Omit<AuditEvent, 'version' | 'id' | 'at'>;

/**
 * Appends one line and returns it.
 *
 * Throws nothing: a trail that cannot be written must not also lose the action
 * it was describing, so a failure here is reported by the returned event's
 * absence rather than by unwinding a completed move.
 */
export function appendAuditEvent(draft: AuditDraft, options: AuditOptions = {}): AuditEvent | null {
  const event: AuditEvent = {
    version: QUARANTINE_FORMAT_VERSION,
    id: randomUUID(),
    at: (options.now ?? (() => new Date()))().toISOString(),
    ...draft,
  };

  try {
    const root = auditRoot(options);
    mkdirSync(root, { recursive: true });
    appendFileSync(path.join(root, AUDIT_FILENAME), `${JSON.stringify(event)}\n`, 'utf8');

    return event;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Accepts a line only if it is one this version understands. */
function parseEvent(line: string): AuditEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (value.version !== QUARANTINE_FORMAT_VERSION) return null;
  if (typeof value.id !== 'string' || typeof value.at !== 'string') return null;
  if (value.action !== 'quarantine' && value.action !== 'delete' && value.action !== 'restore') {
    return null;
  }

  return value as unknown as AuditEvent;
}

/**
 * The trail, newest first.
 *
 * A missing file is an empty trail: nothing destructive has happened here yet,
 * which is the honest answer rather than an error. A line this version cannot
 * read is skipped and every other line survives.
 */
export function readAuditLog(options: AuditOptions & { limit?: number } = {}): AuditEvent[] {
  const file = path.join(auditRoot(options), AUDIT_FILENAME);
  if (!existsSync(file)) return [];

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const events = raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseEvent)
    .filter((event): event is AuditEvent => event !== null)
    .reverse();

  return options.limit === undefined ? events : events.slice(0, options.limit);
}
