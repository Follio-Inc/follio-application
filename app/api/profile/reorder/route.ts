import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Allowed models for reordering.
 * Maps the client-facing model name to the Prisma delegate + ownership field.
 */
const REORDERABLE_MODELS = {
  education: {
    delegate: () => db.education,
    ownerField: 'profileId' as const,
  },
  workExperience: {
    delegate: () => db.workExperience,
    ownerField: 'profileId' as const,
  },
  project: {
    delegate: () => db.project,
    ownerField: 'profileId' as const,
  },
  certification: {
    delegate: () => db.certification,
    ownerField: 'profileId' as const,
  },
  award: {
    delegate: () => db.award,
    ownerField: 'profileId' as const,
  },
  link: {
    delegate: () => db.link,
    ownerField: 'profileId' as const,
  },
  skill: {
    delegate: () => db.skill,
    ownerField: 'profileId' as const,
  },
  skillGroup: {
    delegate: () => db.skillGroup,
    ownerField: 'profileId' as const,
  },
  photo: {
    delegate: () => db.profilePhoto,
    ownerField: 'profileId' as const,
  },
} as const;

type ReorderableModel = keyof typeof REORDERABLE_MODELS;

const ReorderSchema = z.object({
  model: z.enum(Object.keys(REORDERABLE_MODELS) as [ReorderableModel, ...ReorderableModel[]]),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0),
      })
    )
    .min(1)
    .max(500),
});

/**
 * PATCH /api/profile/reorder
 *
 * Generic reorder endpoint for any Prisma-backed model that has a `sortOrder` field.
 * Accepts `{ model, items: [{ id, sortOrder }] }` and updates all rows in a transaction.
 *
 * Security: verifies that every item belongs to the current user's profile.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      throw new AppError('Unauthorized', ErrorCode.UNAUTHORIZED, 401);
    }

    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: { profile: { select: { id: true } } },
    });

    if (!user?.profile) {
      throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
    }

    const body = await request.json();
    const parsed = ReorderSchema.parse(body);

    const modelConfig = REORDERABLE_MODELS[parsed.model];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = modelConfig.delegate() as any;

    // Verify ownership: all IDs must belong to this user's profile
    const existingCount = await delegate.count({
      where: {
        id: { in: parsed.items.map((i) => i.id) },
        [modelConfig.ownerField]: user.profile.id,
      },
    });

    if (existingCount !== parsed.items.length) {
      throw new AppError(
        'One or more items do not belong to your profile',
        ErrorCode.FORBIDDEN,
        403
      );
    }

    // Update all sortOrders in a single transaction
    await db.$transaction(
      parsed.items.map((item) =>
        delegate.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    logger.info('Reordered items', {
      userId: user.id,
      model: parsed.model,
      count: parsed.items.length,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
