/**
 * AI resume edit sessions: propose, apply, undo.
 *
 * Proposals are stored, never written to the resume until the user applies
 * them. Apply and undo run in one transaction and skip any field the user
 * changed in the meantime, so neither can overwrite the user's own edits.
 */

import type { Prisma } from '@prisma/client';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import {
  assistantInstructions,
  type SuggestResumeEditsInput,
} from '@/lib/ai-connector/resume-edits';
import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { Errors } from '@/lib/errors';
import { scheduleResumeRefresh } from '@/lib/resume/schedule-refresh';
import {
  editableDocument,
  planApply,
  planRevert,
  type ChangeOutcome,
  type EditableDocument,
  type EditPlan,
} from '@/lib/resume-edit/document';
import {
  explainProposal,
  RESUME_EDIT_LIMITS,
  type ResumeEditBrief,
  type ResumeEditChange,
  type ResumeEditSessionView,
} from '@/lib/resume-edit/types';
import {
  buildEditFacts,
  groundAssistantEdits,
  proposeResumeEdits,
  type AssistantEditResult,
  type EditFacts,
} from '@/services/ai';
import { loadEditSource } from '@/services/resume-edit-source';
import { getStoredSkillProfile } from '@/services/resume-skill-profile.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_SESSIONS = 5;

type SessionRow = {
  id: string;
  profileId: string;
  brief: Prisma.JsonValue;
  changes: Prisma.JsonValue;
  droppedCount: number;
  failedSections: string[];
  createdAt: Date;
};

function parseChanges(value: Prisma.JsonValue): ResumeEditChange[] {
  return Array.isArray(value) ? (value as unknown as ResumeEditChange[]) : [];
}

function toView(row: SessionRow): ResumeEditSessionView {
  return {
    id: row.id,
    profileId: row.profileId,
    brief: row.brief as unknown as ResumeEditBrief,
    changes: parseChanges(row.changes),
    droppedCount: row.droppedCount,
    failedSections: row.failedSections,
    createdAt: row.createdAt.toISOString(),
  };
}

function isAssistantBrief(brief: Prisma.JsonValue): boolean {
  return Boolean(
    brief && typeof brief === 'object' && !Array.isArray(brief) && typeof brief.via === 'string'
  );
}

/** Builder requests and assistant suggestion sets have separate daily limits. */
async function recentSessionCounts(userId: string) {
  const rows = await db.resumeEditSession.findMany({
    where: { userId, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    select: { brief: true },
  });
  const assistant = rows.filter((row) => isAssistantBrief(row.brief)).length;
  return { builder: rows.length - assistant, assistant };
}

export async function createResumeEditSession(
  clerkId: string,
  brief: ResumeEditBrief
): Promise<ResumeEditSessionView> {
  const { userId, profileId } = await resolveActiveProfileContext(clerkId);

  const recent = await recentSessionCounts(userId);
  if (recent.builder >= RESUME_EDIT_LIMITS.dailySessions) {
    throw Errors.rateLimited("You've used today's AI edits. Try again tomorrow.");
  }

  const profile = await loadEditSource(profileId);

  if (brief.scope.kind === 'experience') {
    const { experienceId } = brief.scope;
    if (!profile.workExperiences.some((item) => item.id === experienceId)) {
      throw Errors.notFound('Experience');
    }
  }

  const proposal = await proposeResumeEdits(
    profile,
    brief,
    brief.jobDescription ? await getStoredSkillProfile(profileId) : null
  );
  const row = await db.resumeEditSession.create({
    data: {
      userId,
      profileId,
      brief: brief as unknown as Prisma.InputJsonValue,
      changes: proposal.changes as unknown as Prisma.InputJsonValue,
      droppedCount: proposal.droppedCount,
      failedSections: proposal.failedSections,
    },
  });
  return toView(row);
}

// ── Connected assistants ─────────────────────────────────

/** The active resume as refs an assistant can point at. */
export async function getEditableResume(clerkId: string): Promise<EditFacts> {
  const { profileId } = await resolveActiveProfileContext(clerkId);
  return buildEditFacts(await loadEditSource(profileId));
}

export interface AssistantSuggestionResult extends Omit<AssistantEditResult, 'changes'> {
  /** Null when nothing survived grounding, so no session was saved. */
  session: ResumeEditSessionView | null;
}

/**
 * Save rewrites an assistant wrote as a session the user can review in the
 * builder. They go through the same grounding as in-app suggestions.
 */
export async function createAssistantResumeEditSession(
  clerkId: string,
  input: SuggestResumeEditsInput,
  via: string
): Promise<AssistantSuggestionResult> {
  const { userId, profileId } = await resolveActiveProfileContext(clerkId);

  const recent = await recentSessionCounts(userId);
  if (recent.assistant >= RESUME_EDIT_LIMITS.assistantDailySessions) {
    throw Errors.rateLimited('Too many suggestion sets today. Try again tomorrow.');
  }

  const grounded = groundAssistantEdits(buildEditFacts(await loadEditSource(profileId)), {
    changes: input.changes,
    instructions: assistantInstructions(input),
    jobDescription: input.jobDescription || null,
  });
  if (grounded.changes.length === 0) {
    return { session: null, dropped: grounded.dropped, ignored: grounded.ignored };
  }

  const brief: ResumeEditBrief = {
    jobDescription: input.jobDescription || null,
    instructions: input.request,
    presets: [],
    scope: { kind: 'all' },
    via,
  };
  const row = await db.resumeEditSession.create({
    data: {
      userId,
      profileId,
      brief: brief as unknown as Prisma.InputJsonValue,
      changes: grounded.changes as unknown as Prisma.InputJsonValue,
      droppedCount: grounded.dropped,
      failedSections: [],
    },
  });
  return { session: toView(row), dropped: grounded.dropped, ignored: grounded.ignored };
}

export async function getResumeEditSession(
  clerkId: string,
  sessionId: string
): Promise<ResumeEditSessionView> {
  const { userId } = await resolveActiveProfileContext(clerkId);
  const row = await db.resumeEditSession.findFirst({ where: { id: sessionId, userId } });
  if (!row) throw Errors.notFound('Suggestions');
  return toView(row);
}

/** Recent sessions for the resume open in the builder, newest first. */
export async function listResumeEditSessions(clerkId: string): Promise<ResumeEditSessionView[]> {
  const { userId, profileId } = await resolveActiveProfileContext(clerkId);
  const rows = await db.resumeEditSession.findMany({
    where: { userId, profileId },
    orderBy: { createdAt: 'desc' },
    take: RECENT_SESSIONS,
  });
  return rows.map(toView);
}

// ── Apply / undo ─────────────────────────────────────────

/** What the builder needs to show the result without reloading. */
export interface ResumeEditProfilePatch {
  headline?: string | null;
  summary?: string | null;
  workExperiences?: Prisma.WorkExperienceGetPayload<object>[];
}

export interface ResumeEditResult {
  session: ResumeEditSessionView;
  outcomes: Record<string, ChangeOutcome>;
  patch: ResumeEditProfilePatch;
}

async function loadDocument(
  tx: Prisma.TransactionClient,
  profileId: string
): Promise<EditableDocument> {
  const profile = await tx.profile.findUnique({
    where: { id: profileId },
    select: {
      headline: true,
      summary: true,
      workExperiences: { select: { id: true, bullets: true, bulletsHtml: true } },
    },
  });
  if (!profile) throw Errors.notFound('Resume');
  return editableDocument(profile);
}

async function writeDocument(
  tx: Prisma.TransactionClient,
  profileId: string,
  before: EditableDocument,
  after: EditableDocument
): Promise<ResumeEditProfilePatch> {
  const patch: ResumeEditProfilePatch = {};
  const profileData: Prisma.ProfileUpdateInput = {};
  if (after.headline !== before.headline) {
    profileData.headline = after.headline;
    patch.headline = after.headline;
  }
  if (after.summary !== before.summary) {
    profileData.summary = after.summary;
    patch.summary = after.summary;
  }
  if (Object.keys(profileData).length > 0) {
    await tx.profile.update({ where: { id: profileId }, data: profileData });
  }

  const changed = after.experiences.filter((item, index) => item !== before.experiences[index]);
  const updated = [];
  for (const item of changed) {
    updated.push(
      await tx.workExperience.update({
        where: { id: item.id },
        data: { bullets: item.bullets, bulletsHtml: item.bulletsHtml },
      })
    );
  }
  if (updated.length > 0) patch.workExperiences = updated;
  return patch;
}

/**
 * Load the session, check it belongs to the resume open in the builder, run
 * the plan against the current resume, and save both in one transaction.
 */
async function runPlan(
  clerkId: string,
  sessionId: string,
  plan: (doc: EditableDocument, changes: ResumeEditChange[]) => EditPlan,
  markApplied: boolean
): Promise<ResumeEditResult> {
  const { userId, profileId } = await resolveActiveProfileContext(clerkId);

  const result = await db.$transaction(async (tx) => {
    const session = await tx.resumeEditSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw Errors.notFound('Suggestions');
    if (session.profileId !== profileId) {
      throw Errors.conflict(
        'These suggestions belong to another resume. Switch back to it to use them.'
      );
    }

    const doc = await loadDocument(tx, profileId);
    const planned = plan(doc, parseChanges(session.changes));
    const patch = await writeDocument(tx, profileId, doc, planned.doc);
    const row = await tx.resumeEditSession.update({
      where: { id: session.id },
      data: {
        changes: planned.changes as unknown as Prisma.InputJsonValue,
        ...(markApplied && Object.values(planned.outcomes).includes('applied')
          ? { appliedAt: new Date() }
          : {}),
      },
    });
    return { session: toView(row), outcomes: planned.outcomes, patch };
  }, interactiveTransactionOptions);

  if (Object.keys(result.patch).length > 0) scheduleResumeRefresh(profileId);
  return result;
}

export interface ApplyResumeEditsInput {
  apply: Array<{ id: string; text: string }>;
  reject: string[];
}

export async function applyResumeEdits(
  clerkId: string,
  sessionId: string,
  input: ApplyResumeEditsInput
): Promise<ResumeEditResult> {
  const chosen = new Map(input.apply.map((item) => [item.id, item.text.trim()]));
  const rejected = new Set(input.reject);
  const now = new Date();

  return runPlan(
    clerkId,
    sessionId,
    (doc, changes) => {
      for (const change of changes) {
        const text = chosen.get(change.id);
        if (text == null) continue;
        const problem = explainProposal(change, text);
        if (problem) throw Errors.validation(`${change.label}: ${problem}`);
      }
      const planned = planApply(doc, changes, chosen, now);
      return {
        ...planned,
        changes: planned.changes.map((change) =>
          rejected.has(change.id) && change.status === 'proposed'
            ? { ...change, status: 'rejected' as const }
            : change
        ),
      };
    },
    true
  );
}

/** Undo applied changes. Omit ids to undo everything this session applied. */
export async function revertResumeEdits(
  clerkId: string,
  sessionId: string,
  ids: string[] | null
): Promise<ResumeEditResult> {
  const only = ids ? new Set(ids) : null;
  return runPlan(clerkId, sessionId, (doc, changes) => planRevert(doc, changes, only), false);
}
