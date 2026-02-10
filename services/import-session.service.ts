/**
 * Import Session Service
 *
 * Manages the lifecycle of import sessions — the core mechanism
 * ensuring that re-imports are "suggested updates", not replacements.
 *
 * Philosophy:
 *   Imports are helpers, not authorities. The Builder is sovereign.
 *   Nothing changes unless the user says so.
 *
 * Flow:
 *   1. User uploads resume → parse → createSession()
 *   2. Session persists parsed data + diff preview in DB
 *   3. User reviews at their own pace (can close & return)
 *   4. User toggles items, edits inline, then clicks "Apply selected"
 *   5. applySession() writes only selected items to Builder
 *   6. Session marked APPLIED (or DISCARDED if user cancels)
 */

import { db } from '@/lib/db';
import type { DataSource, ImportSessionStatus } from '@prisma/client';

// Sessions expire after 30 days of inactivity
const SESSION_TTL_DAYS = 30;

// ─── Types ────────────────────────────────────────────────────────

export interface CreateSessionInput {
  userId: string;
  source: DataSource;
  parsedData: Record<string, unknown>;
  previewData: Record<string, unknown>;
  sourceLabel?: string;
  proposedCount: number;
}

export interface UpdateSessionInput {
  selections?: Record<string, unknown>;
  edits?: Record<string, unknown>;
}

export interface ImportSessionSummary {
  id: string;
  source: DataSource;
  status: ImportSessionStatus;
  sourceLabel: string | null;
  proposedCount: number;
  appliedCount: number | null;
  createdAt: Date;
  appliedAt: Date | null;
  expiresAt: Date;
}

// ─── Service ──────────────────────────────────────────────────────

/**
 * Create a new import session from parsed resume data.
 * Automatically expires any previous PENDING_REVIEW sessions for the same source.
 */
export async function createImportSession(input: CreateSessionInput) {
  const { userId, source, parsedData, previewData, sourceLabel, proposedCount } = input;

  // Expire any existing pending sessions for this source
  // (user is re-importing, so old pending session is stale)
  await db.importSession.updateMany({
    where: {
      userId,
      source,
      status: 'PENDING_REVIEW',
    },
    data: {
      status: 'EXPIRED',
    },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

  const session = await db.importSession.create({
    data: {
      userId,
      source,
      parsedData: parsedData as never,
      previewData: previewData as never,
      sourceLabel,
      proposedCount,
      expiresAt,
    },
  });

  return session;
}

/**
 * Get the active (PENDING_REVIEW) import session for a user + source.
 * Returns null if no active session or if it has expired.
 */
export async function getActiveSession(userId: string, source: DataSource) {
  const session = await db.importSession.findFirst({
    where: {
      userId,
      source,
      status: 'PENDING_REVIEW',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  return session;
}

/**
 * Get an import session by ID (with ownership check).
 */
export async function getSessionById(sessionId: string, userId: string) {
  const session = await db.importSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
  });

  if (!session) return null;

  // Auto-expire if past TTL
  if (session.status === 'PENDING_REVIEW' && session.expiresAt < new Date()) {
    await db.importSession.update({
      where: { id: sessionId },
      data: { status: 'EXPIRED' },
    });
    return null;
  }

  return session;
}

/**
 * Persist the user's toggle selections and inline edits.
 * Called as the user interacts with the review UI so state survives page refreshes.
 */
export async function updateSessionSelections(
  sessionId: string,
  userId: string,
  updates: UpdateSessionInput
) {
  const session = await db.importSession.findFirst({
    where: { id: sessionId, userId, status: 'PENDING_REVIEW' },
  });

  if (!session) {
    throw new Error('Import session not found or already applied');
  }

  return db.importSession.update({
    where: { id: sessionId },
    data: {
      ...(updates.selections !== undefined && { selections: updates.selections as never }),
      ...(updates.edits !== undefined && { edits: updates.edits as never }),
    },
  });
}

/**
 * Mark a session as APPLIED after the user commits their selected changes.
 */
export async function markSessionApplied(sessionId: string, userId: string, appliedCount: number) {
  return db.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'APPLIED',
      appliedCount,
      appliedAt: new Date(),
    },
  });
}

/**
 * Discard a session (user decided not to apply any changes).
 */
export async function discardSession(sessionId: string, userId: string) {
  const session = await db.importSession.findFirst({
    where: { id: sessionId, userId, status: 'PENDING_REVIEW' },
  });

  if (!session) {
    throw new Error('Import session not found or already resolved');
  }

  return db.importSession.update({
    where: { id: sessionId },
    data: { status: 'DISCARDED' },
  });
}

/**
 * List recent import sessions for a user (for history/audit).
 */
export async function listSessions(
  userId: string,
  options: { source?: DataSource; limit?: number } = {}
): Promise<ImportSessionSummary[]> {
  const { source, limit = 10 } = options;

  const sessions = await db.importSession.findMany({
    where: {
      userId,
      ...(source && { source }),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      source: true,
      status: true,
      sourceLabel: true,
      proposedCount: true,
      appliedCount: true,
      createdAt: true,
      appliedAt: true,
      expiresAt: true,
    },
  });

  return sessions;
}

/**
 * Cleanup: expire all stale sessions (run periodically or on-demand).
 */
export async function expireStalesSessions() {
  const result = await db.importSession.updateMany({
    where: {
      status: 'PENDING_REVIEW',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  return result.count;
}
