import type { Prisma } from '@prisma/client';

import { DRAFT_TTL_MS } from '@/lib/ai-connector/constants';
import { hashSecret } from '@/lib/ai-connector/crypto';
import { parseFlexibleDate, requireFlexibleDate } from '@/lib/ai-connector/dates';
import {
  describeOperation,
  operationFromExperience,
  operationFromProject,
  operationFromSummary,
  parseOperations,
  summarizeOperations,
  type DraftOperation,
  type ProposeExperienceInput,
  type ProposeProjectInput,
  type ProposeSummaryInput,
} from '@/lib/ai-connector/operations';
import { toConnectorProfileView } from '@/lib/ai-connector/profile-view';
import {
  applyMessage,
  selectForApply,
  suggestionMessage,
  toAssistantSession,
  toResumeLinesView,
  undoMessage,
  type ResumeEditSelectionInput,
  type SuggestResumeEditsInput,
} from '@/lib/ai-connector/resume-edits';
import { listOwnedResumes, requireOwnedResume } from '@/lib/ai-connector/resume-target';
import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { hasPlaceholder } from '@/lib/resume-edit/types';
import { normalizeCurrentDates } from '@/lib/validations';
import {
  applyResumeEdits,
  createAssistantResumeEditSession,
  getEditableResume,
  getResumeEditSession,
  listResumeEditSessions,
  revertResumeEdits,
} from '@/services/resume-edit-session.service';
import { createResume, type CreatedResume } from '@/services/resume-library.service';

const connectorLogger = logger.child({ source: 'ai-connector' });

export interface ConnectorAuth {
  tokenId: string;
  userId: string;
  clerkId: string;
  scopes: string[];
  clientLabel: string | null;
}

export async function authenticateConnectorToken(token: string): Promise<ConnectorAuth | null> {
  if (!token) return null;

  const record = await db.aiConnectorToken.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: {
      id: true,
      userId: true,
      scopes: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { clerkId: true } },
    },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  await db.aiConnectorToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    tokenId: record.id,
    userId: record.userId,
    clerkId: record.user.clerkId,
    scopes: record.scopes,
    clientLabel: record.label,
  };
}

export async function listConnectorConnections(userId: string) {
  const tokens = await db.aiConnectorToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  return tokens;
}

export async function revokeConnectorToken(userId: string, tokenId: string): Promise<void> {
  const existing = await db.aiConnectorToken.findFirst({
    where: { id: tokenId, userId },
    select: { id: true },
  });

  if (!existing) {
    throw Errors.notFound('Connection');
  }

  await db.aiConnectorToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

async function connectorUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw Errors.notFound('User');
  return user;
}

function createdResumeView(
  created: CreatedResume,
  message: string,
  extra: Record<string, unknown> = {}
) {
  return {
    resumeId: created.id,
    title: created.resumeTitle,
    handle: created.handle,
    ...extra,
    message,
  };
}

export async function createConnectorResume(userId: string, title?: string) {
  const user = await connectorUser(userId);
  const created = await createResume({
    userId: user.id,
    email: user.email,
    strategy: 'BLANK',
    title,
    activate: false,
  });
  return createdResumeView(
    created,
    'Created a blank resume. Pass this resumeId on later tools. It is private. The Follio builder still shows the resume that was already open.'
  );
}

export async function cloneConnectorResume(userId: string, resumeRef: string, title?: string) {
  const user = await connectorUser(userId);
  const source = await requireOwnedResume(userId, resumeRef);
  const created = await createResume({
    userId: user.id,
    email: user.email,
    strategy: 'CLONE',
    sourceProfileId: source.resumeId,
    title,
    activate: false,
  });
  return createdResumeView(
    created,
    `Cloned “${source.title}”. Pass this resumeId on later tools. The original is unchanged. The copy is private and was not switched in the Follio builder.`,
    { sourceResumeId: source.resumeId, sourceTitle: source.title }
  );
}

export async function listConnectorResumes(userId: string) {
  const resumes = await listOwnedResumes(userId);
  return {
    resumes,
    note: 'Pass resumeId on every other tool. isActive is only a hint — never assume it.',
  };
}

export async function getConnectorProfile(userId: string, resumeRef: string) {
  const resume = await requireOwnedResume(userId, resumeRef);
  const profileId = resume.resumeId;

  const profile = await db.profile.findUnique({
    where: { id: profileId },
    include: {
      contactInfo: true,
      workExperiences: { orderBy: { sortOrder: 'asc' } },
      educations: { orderBy: { sortOrder: 'asc' } },
      skills: { orderBy: { sortOrder: 'asc' } },
      skillGroups: {
        include: { skills: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      projects: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!profile) {
    throw Errors.notFound('Profile');
  }

  return {
    resumeId: resume.resumeId,
    title: resume.title,
    isActive: resume.isActive,
    ...toConnectorProfileView(profile),
  };
}

async function getOrCreatePendingDraft(
  userId: string,
  clientLabel: string | null,
  profileId: string
) {
  const now = new Date();

  const existing = await db.aiEditDraft.findFirst({
    where: {
      userId,
      profileId,
      status: 'PENDING',
      expiresAt: { gt: now },
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) return existing;

  return db.aiEditDraft.create({
    data: {
      userId,
      profileId,
      status: 'PENDING',
      operations: [],
      summary: 'No changes yet',
      clientLabel,
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
    },
  });
}

async function appendOperation(
  userId: string,
  clientLabel: string | null,
  profileId: string,
  operation: DraftOperation
) {
  const draft = await getOrCreatePendingDraft(userId, clientLabel, profileId);
  const operations = [...parseOperations(draft.operations), operation];
  const summary = summarizeOperations(operations);

  const updated = await db.aiEditDraft.update({
    where: { id: draft.id },
    data: {
      operations: operations as unknown as Prisma.InputJsonValue,
      summary,
      clientLabel: clientLabel ?? draft.clientLabel,
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
  });

  return {
    draftId: updated.id,
    resumeId: updated.profileId,
    status: updated.status,
    summary: updated.summary,
    operations,
    added: describeOperation(operation),
    message:
      'Saved to a draft. The live Follio is unchanged. Ask the user to confirm, then call apply_draft with this resumeId.',
  };
}

export async function proposeSummary(
  userId: string,
  clientLabel: string | null,
  resumeRef: string,
  input: ProposeSummaryInput
) {
  const resume = await requireOwnedResume(userId, resumeRef);
  return appendOperation(userId, clientLabel, resume.resumeId, operationFromSummary(input));
}

export async function proposeExperience(
  userId: string,
  clientLabel: string | null,
  resumeRef: string,
  input: ProposeExperienceInput
) {
  requireFlexibleDate(input.startDate, 'startDate');
  if (input.endDate) requireFlexibleDate(input.endDate, 'endDate');
  const resume = await requireOwnedResume(userId, resumeRef);
  return appendOperation(userId, clientLabel, resume.resumeId, operationFromExperience(input));
}

export async function proposeProject(
  userId: string,
  clientLabel: string | null,
  resumeRef: string,
  input: ProposeProjectInput
) {
  const resume = await requireOwnedResume(userId, resumeRef);
  return appendOperation(userId, clientLabel, resume.resumeId, operationFromProject(input));
}

function serializeDraft(draft: {
  id: string;
  profileId: string;
  status: string;
  summary: string;
  operations: unknown;
  clientLabel: string | null;
  createdAt: Date;
  expiresAt: Date;
  appliedAt: Date | null;
}) {
  return {
    draftId: draft.id,
    resumeId: draft.profileId,
    status: draft.status,
    summary: draft.summary,
    operations: parseOperations(draft.operations),
    clientLabel: draft.clientLabel,
    createdAt: draft.createdAt.toISOString(),
    expiresAt: draft.expiresAt.toISOString(),
    appliedAt: draft.appliedAt?.toISOString() ?? null,
  };
}

export async function listDrafts(userId: string, includeApplied = false, resumeRef?: string) {
  const resume = resumeRef ? await requireOwnedResume(userId, resumeRef) : null;
  const drafts = await db.aiEditDraft.findMany({
    where: {
      userId,
      ...(resume ? { profileId: resume.resumeId } : {}),
      ...(includeApplied ? {} : { status: 'PENDING' }),
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });

  const now = Date.now();
  const live = [];
  for (const draft of drafts) {
    if (draft.status === 'PENDING' && draft.expiresAt.getTime() <= now) {
      await db.aiEditDraft.update({
        where: { id: draft.id },
        data: { status: 'EXPIRED' },
      });
      continue;
    }
    live.push(serializeDraft(draft));
  }

  return live;
}

async function getOwnedDraft(userId: string, draftId: string) {
  const draft = await db.aiEditDraft.findFirst({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw Errors.notFound('Draft');
  }

  return draft;
}

async function requireDraftOnResume(userId: string, draftId: string, resumeRef: string) {
  const resume = await requireOwnedResume(userId, resumeRef);
  const draft = await getOwnedDraft(userId, draftId);
  if (draft.profileId !== resume.resumeId) {
    throw Errors.badRequest(
      'That draft belongs to a different resume. Pass the resumeId from the draft.'
    );
  }
  return draft;
}

export async function discardDraft(userId: string, draftId: string, resumeRef?: string) {
  const draft = resumeRef
    ? await requireDraftOnResume(userId, draftId, resumeRef)
    : await getOwnedDraft(userId, draftId);
  if (draft.status !== 'PENDING') {
    throw Errors.badRequest('Only pending drafts can be discarded');
  }

  const updated = await db.aiEditDraft.update({
    where: { id: draft.id },
    data: { status: 'DISCARDED', discardedAt: new Date() },
  });

  return serializeDraft(updated);
}

async function applyOperation(
  tx: Prisma.TransactionClient,
  profileId: string,
  operation: DraftOperation
): Promise<void> {
  if (operation.type === 'update_summary') {
    await tx.profile.update({
      where: { id: profileId },
      data: {
        ...(operation.headline !== undefined
          ? { headline: operation.headline, headlineSource: 'MANUAL' }
          : {}),
        ...(operation.summary !== undefined
          ? { summary: operation.summary, summarySource: 'MANUAL' }
          : {}),
      },
    });
    return;
  }

  if (operation.type === 'add_experience') {
    const last = await tx.workExperience.findFirst({
      where: { profileId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const startDate = requireFlexibleDate(operation.startDate, 'startDate');
    const endDate = operation.endDate ? parseFlexibleDate(operation.endDate) : null;
    const normalized = normalizeCurrentDates({
      isCurrent: operation.isCurrent ?? !endDate,
      endDate,
    });

    await tx.workExperience.create({
      data: {
        profileId,
        company: operation.company,
        role: operation.role,
        location: operation.location,
        startDate,
        endDate: normalized.endDate,
        isCurrent: normalized.isCurrent ?? false,
        bullets: operation.bullets ?? [],
        sortOrder: (last?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });
    return;
  }

  if (operation.type === 'add_project') {
    const last = await tx.project.findFirst({
      where: { profileId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    await tx.project.create({
      data: {
        profileId,
        title: operation.title,
        description: operation.description,
        url: operation.url,
        techStack: operation.techStack ?? [],
        highlights: operation.highlights ?? [],
        sortOrder: (last?.sortOrder ?? -1) + 1,
        source: 'MANUAL',
      },
    });
  }
}

export async function applyDraft(userId: string, draftId: string, resumeRef?: string) {
  const draft = resumeRef
    ? await requireDraftOnResume(userId, draftId, resumeRef)
    : await getOwnedDraft(userId, draftId);

  if (draft.status !== 'PENDING') {
    throw Errors.badRequest('This draft has already been applied or discarded');
  }

  if (draft.expiresAt.getTime() <= Date.now()) {
    await db.aiEditDraft.update({
      where: { id: draft.id },
      data: { status: 'EXPIRED' },
    });
    throw Errors.badRequest('This draft expired. Propose the changes again.');
  }

  const operations = parseOperations(draft.operations);
  if (operations.length === 0) {
    throw Errors.badRequest('This draft has no changes to apply');
  }

  await db.$transaction(async (tx) => {
    for (const operation of operations) {
      await applyOperation(tx, draft.profileId, operation);
    }

    await tx.aiEditDraft.update({
      where: { id: draft.id },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
  }, interactiveTransactionOptions);

  connectorLogger.info('Applied AI connector draft', {
    userId,
    draftId,
    operationCount: operations.length,
  });

  return {
    draftId: draft.id,
    resumeId: draft.profileId,
    status: 'APPLIED' as const,
    applied: operations.map(describeOperation),
    message: 'Draft applied. The live Follio is updated.',
  };
}

// ── Resume line edits ────────────────────────────────────

type AssistantContext = { clerkId: string; userId: string; clientLabel: string | null };

async function resumeIdFrom(ctx: AssistantContext, resumeRef: string) {
  return (await requireOwnedResume(ctx.userId, resumeRef)).resumeId;
}

async function getResumeLines(ctx: AssistantContext, resumeRef: string) {
  return toResumeLinesView(
    await getEditableResume(ctx.clerkId, await resumeIdFrom(ctx, resumeRef))
  );
}

async function suggestResumeEdits(
  ctx: AssistantContext,
  input: SuggestResumeEditsInput & { resumeId: string }
) {
  const profileId = await resumeIdFrom(ctx, input.resumeId);
  const result = await createAssistantResumeEditSession(
    ctx.clerkId,
    input,
    ctx.clientLabel || 'AI assistant',
    profileId
  );
  const changes = result.session?.changes ?? [];
  const message = suggestionMessage({
    saved: changes.length,
    needsInput: changes.filter((change) => hasPlaceholder(change.after)).length,
    dropped: result.dropped,
    ignored: result.ignored,
  });
  if (!result.session) return { saved: false, message };
  return { saved: true, message, ...toAssistantSession(result.session) };
}

async function applyResumeEditsForAssistant(
  ctx: AssistantContext,
  input: ResumeEditSelectionInput & { resumeId: string }
) {
  const profileId = await resumeIdFrom(ctx, input.resumeId);
  const session = await getResumeEditSession(ctx.clerkId, input.sessionId);
  const selection = selectForApply(session.changes, input.changeIds);
  const counts = {
    needsInput: selection.needsInput.length,
    unavailable: selection.unavailable.length,
  };
  if (selection.ready.length === 0) {
    return {
      message: applyMessage({ applied: 0, conflicted: 0, ...counts }),
      ...toAssistantSession(session),
    };
  }

  const result = await applyResumeEdits(
    ctx.clerkId,
    session.id,
    {
      apply: selection.ready.map((change) => ({ id: change.id, text: change.after })),
      reject: [],
    },
    profileId
  );
  const outcomes = Object.values(result.outcomes);
  const applied = outcomes.filter((outcome) => outcome === 'applied').length;
  connectorLogger.info('Assistant applied resume edits', {
    userId: ctx.userId,
    sessionId: session.id,
    applied,
  });
  return {
    message: applyMessage({ applied, conflicted: outcomes.length - applied, ...counts }),
    ...toAssistantSession(result.session),
  };
}

async function undoResumeEditsForAssistant(
  ctx: AssistantContext,
  input: ResumeEditSelectionInput & { resumeId: string }
) {
  const profileId = await resumeIdFrom(ctx, input.resumeId);
  const result = await revertResumeEdits(
    ctx.clerkId,
    input.sessionId,
    input.changeIds ?? null,
    profileId
  );
  const outcomes = Object.values(result.outcomes);
  return {
    message: undoMessage({
      reverted: outcomes.filter((outcome) => outcome === 'reverted').length,
      kept: outcomes.filter((outcome) => outcome === 'kept').length,
    }),
    ...toAssistantSession(result.session),
  };
}

async function listResumeEditsForAssistant(ctx: AssistantContext, resumeRef: string) {
  const profileId = await resumeIdFrom(ctx, resumeRef);
  const sessions = await listResumeEditSessions(ctx.clerkId, profileId);
  return { resumeId: profileId, sessions: sessions.map(toAssistantSession) };
}

type ResumeToolInput = { resumeId: string };

export const aiConnectorHandlers = {
  listResumes: (ctx: { userId: string }) => listConnectorResumes(ctx.userId),
  getResume: (ctx: { userId: string }, input: unknown) =>
    getConnectorProfile(ctx.userId, (input as ResumeToolInput).resumeId),
  createResume: (ctx: { userId: string }, input: unknown) =>
    createConnectorResume(ctx.userId, (input as { title?: string }).title),
  cloneResume: (ctx: { userId: string }, input: unknown) =>
    cloneConnectorResume(
      ctx.userId,
      (input as ResumeToolInput).resumeId,
      (input as { title?: string }).title
    ),
  listDrafts: (ctx: { userId: string }, input: unknown) =>
    listDrafts(ctx.userId, false, (input as ResumeToolInput).resumeId),
  proposeSummary: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeSummary(
      ctx.userId,
      ctx.clientLabel,
      (input as ResumeToolInput).resumeId,
      input as ProposeSummaryInput
    ),
  proposeExperience: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeExperience(
      ctx.userId,
      ctx.clientLabel,
      (input as ResumeToolInput).resumeId,
      input as ProposeExperienceInput
    ),
  proposeProject: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeProject(
      ctx.userId,
      ctx.clientLabel,
      (input as ResumeToolInput).resumeId,
      input as ProposeProjectInput
    ),
  applyDraft: (ctx: { userId: string }, input: unknown) =>
    applyDraft(
      ctx.userId,
      (input as { draftId: string }).draftId,
      (input as ResumeToolInput).resumeId
    ),
  discardDraft: (ctx: { userId: string }, input: unknown) =>
    discardDraft(
      ctx.userId,
      (input as { draftId: string }).draftId,
      (input as ResumeToolInput).resumeId
    ),
  getResumeLines: (ctx: AssistantContext, input: unknown) =>
    getResumeLines(ctx, (input as ResumeToolInput).resumeId),
  suggestResumeEdits: (ctx: AssistantContext, input: unknown) =>
    suggestResumeEdits(ctx, input as SuggestResumeEditsInput & { resumeId: string }),
  applyResumeEdits: (ctx: AssistantContext, input: unknown) =>
    applyResumeEditsForAssistant(ctx, input as ResumeEditSelectionInput & { resumeId: string }),
  undoResumeEdits: (ctx: AssistantContext, input: unknown) =>
    undoResumeEditsForAssistant(ctx, input as ResumeEditSelectionInput & { resumeId: string }),
  listResumeEdits: (ctx: AssistantContext, input: unknown) =>
    listResumeEditsForAssistant(ctx, (input as ResumeToolInput).resumeId),
};
