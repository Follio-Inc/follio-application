/**
 * Turning a stored proposal target into one conditional SQL write.
 *
 * The important property here is that applying a proposal is **never** a
 * read-modify-write. Every statement this module builds is a compare-and-swap:
 * it names the row by primary key, scopes it to the owning resume, and only
 * writes when the field still holds exactly the text the proposal recorded.
 *
 *     UPDATE "WorkExperience"
 *        SET bullets[3] = $new, "updatedAt" = NOW()
 *      WHERE id = $id AND "profileId" = $resume AND bullets[3] = $original
 *
 * `rowsAffected === 1` therefore means: the row existed, it belonged to this
 * resume, the bullet was still the one the user reviewed, and we replaced that
 * single array element. `0` means one of those was false, and nothing was
 * written. There is no window between the read and the write for another
 * writer to slip into, because there is no separate read.
 *
 * That is stronger than a row-version token. A `updatedAt` check would reject
 * a concurrent edit to *any* field of the row; element-level comparison
 * rejects only a concurrent edit to the text actually being replaced, and
 * still cannot lose one. It also means the Builder saving a different bullet
 * on the same role at the same moment does not spuriously fail an apply.
 *
 * Array subscripts are composed with `Prisma.raw` rather than bound as
 * parameters, because a subscript in an UPDATE target is not a parameterizable
 * position in Postgres. `buildApplyStatement` refuses any index that is not a
 * non-negative integer before it reaches that point, so there is no path by
 * which a value that is not a plain number is interpolated.
 */

import { Prisma } from '@prisma/client';

import {
  isRewritableField,
  parseTargetRef,
  PROFILE_RECORD_ID,
  type ProposalTarget,
} from '@/lib/resume-rewrite';

/** Where a target lives, once resolved against the schema. */
export type TargetTable = 'Profile' | 'WorkExperience' | 'Project';

export interface ResolvedTarget {
  table: TargetTable;
  /** Prisma column holding the text. */
  column: 'summary' | 'bullets' | 'description' | 'highlights';
  /** Array position, when the column is a text[]. */
  index?: number;
  target: ProposalTarget;
}

export type TargetResolution =
  | { ok: true; resolved: ResolvedTarget }
  | { ok: false; reason: string };

/**
 * Map a stored `targetRef` onto a table and column.
 *
 * Goes through `parseTargetRef` and `isRewritableField` from
 * lib/resume-rewrite — the same two functions that constrained the agent — so
 * the set of fields a proposal may write is defined once. Widening what an
 * agent may propose and widening what may be applied cannot drift apart,
 * because they are the same list.
 */
export function resolveApplyTarget(targetRef: string): TargetResolution {
  const target = parseTargetRef(targetRef);
  if (!target) {
    return { ok: false, reason: `"${targetRef}" is not a valid resume target.` };
  }

  if (!isRewritableField(target)) {
    return {
      ok: false,
      reason: `"${target.section}.${target.field}" is not a field that may be rewritten.`,
    };
  }

  if (target.section === 'summary' && target.field === 'summary') {
    // The summary lives on the resume row itself, so its `recordId` is the
    // sentinel rather than a child row's id. Checked rather than assumed: a
    // stored target carrying anything else does not address this resume's
    // summary and must not be treated as if it did.
    if (target.recordId !== PROFILE_RECORD_ID) {
      return { ok: false, reason: 'This suggestion does not address the resume summary.' };
    }
    return { ok: true, resolved: { table: 'Profile', column: 'summary', target } };
  }

  if (target.section === 'experience' && target.field === 'bullets') {
    if (!Number.isInteger(target.index) || (target.index as number) < 0) {
      return { ok: false, reason: 'This suggestion has no valid bullet position.' };
    }
    return {
      ok: true,
      resolved: { table: 'WorkExperience', column: 'bullets', index: target.index, target },
    };
  }

  if (target.section === 'project' && target.field === 'description') {
    return { ok: true, resolved: { table: 'Project', column: 'description', target } };
  }

  if (target.section === 'project' && target.field === 'highlights') {
    if (!Number.isInteger(target.index) || (target.index as number) < 0) {
      return { ok: false, reason: 'This suggestion has no valid highlight position.' };
    }
    return {
      ok: true,
      resolved: { table: 'Project', column: 'highlights', index: target.index, target },
    };
  }

  return { ok: false, reason: `"${targetRef}" does not address a rewritable resume field.` };
}

/** Owner scoping for each table: the column that ties a row to the resume. */
function ownerClause(table: TargetTable, recordId: string, resumeId: string): Prisma.Sql {
  // A Profile *is* the resume, so its own id is the whole scope — its
  // `recordId` is the `profile` sentinel, which `resolveApplyTarget` has
  // already checked and which is not a row id. The child tables carry
  // `profileId`. Either way the write can only land on a row belonging to the
  // resume the request named: a stored `targetRecordId` pointing at another
  // user's work experience matches nothing, because that row's `profileId` is
  // not this resume.
  return table === 'Profile'
    ? Prisma.sql`"id" = ${resumeId}`
    : Prisma.sql`"id" = ${recordId} AND "profileId" = ${resumeId}`;
}

/** A safe, literal array subscript. Postgres arrays are 1-indexed. */
function subscript(index: number): Prisma.Sql {
  if (!Number.isInteger(index) || index < 0 || index > 10_000) {
    // Unreachable through `resolveApplyTarget`; here so that a future caller
    // cannot reach `Prisma.raw` with anything but a bounded integer.
    throw new Error(`Refusing to build a statement for array index ${index}.`);
  }
  return Prisma.raw(String(index + 1));
}

export interface ApplyStatementInput {
  resolved: ResolvedTarget;
  /** The owning resume. Every statement is scoped to it. */
  resumeId: string;
  /** The row holding the text. */
  recordId: string;
  /** What the proposal recorded as the current text. The swap condition. */
  originalText: string;
  /** The verified replacement, read from storage — never from a request. */
  proposedText: string;
}

/**
 * Build the one statement that performs the edit.
 *
 * Also stamps `updatedAt`, which Prisma's `@updatedAt` would normally set:
 * a raw statement bypasses that, and leaving the column stale would make the
 * resume look untouched to anything that watches it.
 */
export function buildApplyStatement(input: ApplyStatementInput): Prisma.Sql {
  const { resolved, resumeId, recordId, originalText, proposedText } = input;
  const where = ownerClause(resolved.table, recordId, resumeId);

  if (resolved.table === 'Profile') {
    return Prisma.sql`
      UPDATE "Profile"
         SET "summary" = ${proposedText}, "updatedAt" = NOW()
       WHERE ${where} AND "summary" = ${originalText}
    `;
  }

  if (resolved.table === 'WorkExperience') {
    const position = subscript(resolved.index as number);
    return Prisma.sql`
      UPDATE "WorkExperience"
         SET "bullets"[${position}] = ${proposedText}, "updatedAt" = NOW()
       WHERE ${where} AND "bullets"[${position}] = ${originalText}
    `;
  }

  if (resolved.column === 'description') {
    return Prisma.sql`
      UPDATE "Project"
         SET "description" = ${proposedText}, "updatedAt" = NOW()
       WHERE ${where} AND "description" = ${originalText}
    `;
  }

  const position = subscript(resolved.index as number);
  return Prisma.sql`
    UPDATE "Project"
       SET "highlights"[${position}] = ${proposedText}, "updatedAt" = NOW()
     WHERE ${where} AND "highlights"[${position}] = ${originalText}
  `;
}

// ============================================================================
// READING THE CURRENT VALUE
// ============================================================================

/** What the resume says at a target right now, for staleness reporting. */
export type CurrentValue =
  | { ok: true; text: string }
  | { ok: false; reason: 'missing-record' | 'missing-index'; detail: string };

/**
 * Read the live text at a target from already-loaded rows.
 *
 * Used for *reporting* staleness on a GET, which never writes. The apply path
 * does not rely on this: its guarantee comes from the conditional statement
 * above, which re-checks the same thing inside the write itself.
 */
export function readCurrentValue(
  resolved: ResolvedTarget,
  rows: {
    profile: { id: string; summary: string | null };
    experiences: Array<{ id: string; bullets: string[] }>;
    projects: Array<{ id: string; description: string | null; highlights: string[] }>;
  }
): CurrentValue {
  const { target } = resolved;

  if (resolved.table === 'Profile') {
    return { ok: true, text: rows.profile.summary ?? '' };
  }

  if (resolved.table === 'WorkExperience') {
    const row = rows.experiences.find((item) => item.id === target.recordId);
    if (!row) {
      return {
        ok: false,
        reason: 'missing-record',
        detail: 'The work experience this suggestion refers to is no longer on your resume.',
      };
    }
    const index = resolved.index as number;
    if (index >= row.bullets.length) {
      return {
        ok: false,
        reason: 'missing-index',
        detail: 'That bullet has been removed or the bullets were reordered.',
      };
    }
    return { ok: true, text: row.bullets[index] };
  }

  const row = rows.projects.find((item) => item.id === target.recordId);
  if (!row) {
    return {
      ok: false,
      reason: 'missing-record',
      detail: 'The project this suggestion refers to is no longer on your resume.',
    };
  }

  if (resolved.column === 'description') {
    return { ok: true, text: row.description ?? '' };
  }

  const index = resolved.index as number;
  if (index >= row.highlights.length) {
    return {
      ok: false,
      reason: 'missing-index',
      detail: 'That highlight has been removed or the highlights were reordered.',
    };
  }
  return { ok: true, text: row.highlights[index] };
}
