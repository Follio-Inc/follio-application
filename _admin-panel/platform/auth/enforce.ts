/**
 * The one place a privileged Platform route asks "may this admin, and record
 * that they asked" (PLATFORM_TODO item 28).
 *
 * Server-only. Every route calls this rather than comparing a role itself, so
 * three things cannot drift apart: the permission required, the refusal
 * returned, and the audit line written. A route that forgot to audit its
 * denials would otherwise look identical to one that remembered.
 *
 * The audit is item 19's, extended — same append-only JSONL, same writer,
 * same file. There is no second trail.
 *
 * ## Why this is two functions
 *
 * The first version took a `target` and audited allowed and denied attempts
 * in one call. That forced every route to parse its request payload *before*
 * the permission check, so the audit line could name a real target — and on
 * the two multipart routes it meant buffering and parsing up to 5 MB of
 * upload for a caller who was about to be refused, or whose deployment is
 * production. Audit detail is not worth doing attacker-controlled work for.
 *
 * So the check comes first and needs no target: a denial is recorded against
 * the action itself, which is all that is known and all that matters — *who*
 * asked for *what kind of thing* and was told no. Once the guards have
 * passed and the payload is safely parsed, `auditPlatformAction` records the
 * permitted attempt with the concrete target.
 */

import { appendAuditEvent, type AuditOptions } from '../drift/audit';
import type { AuditAction, AuditResult } from '../drift/quarantine-types';
import { authorizePlatform, type RoleLookup } from './guard';
import type { PlatformPermission, PlatformRole } from './types';

export type EnforceInput = {
  adminId: string;
  permission: PlatformPermission;
  action: AuditAction;
  /**
   * What a denial is recorded against, when no concrete target is safely
   * known yet. Defaults to the action. Never taken from a request.
   */
  resource?: string;
  /** Role lookup seam, so a test need not reach the database. */
  lookup?: RoleLookup;
  /** Audit location seam, so a test writes into a temporary directory. */
  audit?: AuditOptions;
};

export type EnforceResult =
  | { allowed: true; role: PlatformRole }
  | { allowed: false; role: PlatformRole | null; reason: string; status: 403 };

/** The audit draft shape, with the fields a non-destructive action has no use for. */
function draftFor(
  action: AuditAction,
  result: AuditResult,
  target: string,
  adminId: string,
  role: PlatformRole | null,
  reason: string | null
) {
  return {
    action,
    result,
    // `path` carries the target for every action. For the three destructive
    // ones it is a repo-relative path, as item 19 wrote it; for the rest it
    // is the id that was acted on, or the action itself for a denial raised
    // before anything had been parsed.
    path: target,
    quarantineId: null,
    signal: null,
    group: null,
    evidence: [],
    sha256Before: null,
    sha256After: null,
    approval: null,
    actorId: adminId,
    actorRole: role,
    reason,
  };
}

/**
 * Authorizes, auditing a refusal.
 *
 * Call this **before** the local-only guard and before touching the request
 * payload. A denial is written before it is returned, so a refused attempt
 * is on the record whether or not the caller does anything else with it.
 *
 * A permitted attempt is deliberately *not* recorded here: nothing has been
 * parsed or validated yet, so there is no target worth storing. The route
 * calls `auditPlatformAction` once there is one.
 */
export async function enforcePlatformAction(input: EnforceInput): Promise<EnforceResult> {
  const authz = await authorizePlatform(input.adminId, input.permission, input.lookup);

  if (!authz.allowed) {
    appendAuditEvent(
      draftFor(
        input.action,
        'denied-role',
        input.resource ?? input.action,
        input.adminId,
        authz.role,
        authz.reason
      ),
      input.audit ?? {}
    );

    return {
      allowed: false,
      role: authz.role,
      reason: authz.reason,
      status: 403,
    };
  }

  return { allowed: true, role: authz.role };
}

export type AuditAttemptInput = {
  adminId: string;
  role: PlatformRole;
  action: AuditAction;
  /** The concrete target, now that it is safely known. */
  target: string;
  /**
   * Defaults to `ok` — a permitted attempt.
   *
   * Item 29 passes `refused` when a run clears the role gate and the local
   * guard but is turned away by the daily cost cap. That is a refusal of the
   * action, not of the actor, so it is not `denied-role`.
   */
  result?: AuditResult;
  /** Why, when it was not `ok`. */
  reason?: string | null;
  audit?: AuditOptions;
};

/**
 * Records a permitted attempt.
 *
 * The attempt, not the outcome: the operation has not run yet, and the
 * routes that can report a real result append their own line when it does.
 */
export function auditPlatformAction(input: AuditAttemptInput): void {
  appendAuditEvent(
    draftFor(
      input.action,
      input.result ?? 'ok',
      input.target,
      input.adminId,
      input.role,
      input.reason ?? null
    ),
    input.audit ?? {}
  );
}

/** The body a route returns when `enforcePlatformAction` says no. */
export function deniedBody(result: Extract<EnforceResult, { allowed: false }>) {
  return {
    error:
      result.reason === 'insufficient-role'
        ? `This action needs a higher Platform role. Yours is ${result.role}.`
        : 'Your Platform role could not be established.',
    reason: result.reason,
    role: result.role,
  };
}
