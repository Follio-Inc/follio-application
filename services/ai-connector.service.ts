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
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { normalizeCurrentDates } from '@/lib/validations';

const connectorLogger = logger.child({ source: 'ai-connector' });

export interface ConnectorAuth {
  tokenId: string;
  userId: string;
  clerkId: string;
  scopes: string[];
  clientLabel: string | null;
}

async function resolveActiveProfileId(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      profile: { select: { id: true } },
    },
  });

  if (user?.profile?.id) return user.profile.id;

  const fallback = await db.profile.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!fallback) {
    throw Errors.notFound('Follio');
  }

  await db.user.update({
    where: { id: userId },
    data: { profile: { connect: { id: fallback.id } } },
  });

  return fallback.id;
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

export async function getConnectorProfile(userId: string) {
  const profileId = await resolveActiveProfileId(userId);

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

  return toConnectorProfileView(profile);
}

async function getOrCreatePendingDraft(userId: string, clientLabel: string | null) {
  const profileId = await resolveActiveProfileId(userId);
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
  operation: DraftOperation
) {
  const draft = await getOrCreatePendingDraft(userId, clientLabel);
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
    status: updated.status,
    summary: updated.summary,
    operations,
    added: describeOperation(operation),
    message:
      'Saved to a draft. The live Follio is unchanged. Ask the user to confirm, then call apply_draft.',
  };
}

export async function proposeSummary(
  userId: string,
  clientLabel: string | null,
  input: ProposeSummaryInput
) {
  return appendOperation(userId, clientLabel, operationFromSummary(input));
}

export async function proposeExperience(
  userId: string,
  clientLabel: string | null,
  input: ProposeExperienceInput
) {
  requireFlexibleDate(input.startDate, 'startDate');
  if (input.endDate) requireFlexibleDate(input.endDate, 'endDate');
  return appendOperation(userId, clientLabel, operationFromExperience(input));
}

export async function proposeProject(
  userId: string,
  clientLabel: string | null,
  input: ProposeProjectInput
) {
  return appendOperation(userId, clientLabel, operationFromProject(input));
}

function serializeDraft(draft: {
  id: string;
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
    status: draft.status,
    summary: draft.summary,
    operations: parseOperations(draft.operations),
    clientLabel: draft.clientLabel,
    createdAt: draft.createdAt.toISOString(),
    expiresAt: draft.expiresAt.toISOString(),
    appliedAt: draft.appliedAt?.toISOString() ?? null,
  };
}

export async function listDrafts(userId: string, includeApplied = false) {
  const drafts = await db.aiEditDraft.findMany({
    where: {
      userId,
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

export async function discardDraft(userId: string, draftId: string) {
  const draft = await getOwnedDraft(userId, draftId);
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

export async function applyDraft(userId: string, draftId: string) {
  const draft = await getOwnedDraft(userId, draftId);

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
  });

  connectorLogger.info('Applied AI connector draft', {
    userId,
    draftId,
    operationCount: operations.length,
  });

  return {
    draftId: draft.id,
    status: 'APPLIED' as const,
    applied: operations.map(describeOperation),
    message: 'Draft applied. The live Follio is updated.',
  };
}

export const aiConnectorHandlers = {
  getProfile: (ctx: { userId: string }) => getConnectorProfile(ctx.userId),
  listDrafts: (ctx: { userId: string }) => listDrafts(ctx.userId),
  proposeSummary: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeSummary(ctx.userId, ctx.clientLabel, input as ProposeSummaryInput),
  proposeExperience: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeExperience(ctx.userId, ctx.clientLabel, input as ProposeExperienceInput),
  proposeProject: (ctx: { userId: string; clientLabel: string | null }, input: unknown) =>
    proposeProject(ctx.userId, ctx.clientLabel, input as ProposeProjectInput),
  applyDraft: (ctx: { userId: string }, input: unknown) =>
    applyDraft(ctx.userId, (input as { draftId: string }).draftId),
  discardDraft: (ctx: { userId: string }, input: unknown) =>
    discardDraft(ctx.userId, (input as { draftId: string }).draftId),
};
