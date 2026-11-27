import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { AppError, ErrorCode, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { scheduleResumeRefresh } from '@/lib/resume/schedule-refresh';

/**
 * Allowed models for reordering.
 * Maps the client-facing model name to the Prisma delegate + ownership field.
 */
const REORDERABLE_MODELS = {
  education: {
    clientKey: 'education' as const,
    ownerField: 'profileId' as const,
  },
  workExperience: {
    clientKey: 'workExperience' as const,
    ownerField: 'profileId' as const,
  },
  project: {
    clientKey: 'project' as const,
    ownerField: 'profileId' as const,
  },
  certification: {
    clientKey: 'certification' as const,
    ownerField: 'profileId' as const,
  },
  award: {
    clientKey: 'award' as const,
    ownerField: 'profileId' as const,
  },
  link: {
    clientKey: 'link' as const,
    ownerField: 'profileId' as const,
  },
  skill: {
    clientKey: 'skill' as const,
    ownerField: 'profileId' as const,
  },
  skillGroup: {
    clientKey: 'skillGroup' as const,
    ownerField: 'profileId' as const,
  },
  photo: {
    clientKey: 'profilePhoto' as const,
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

    const context = await resolveActiveProfileContext(userId);

    const body = await request.json();
    const parsed = ReorderSchema.parse(body);

    const modelConfig = REORDERABLE_MODELS[parsed.model];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = db[modelConfig.clientKey] as any;

    // Verify ownership: all IDs must belong to this user's profile
    const existingCount = await delegate.count({
      where: {
        id: { in: parsed.items.map((i) => i.id) },
        [modelConfig.ownerField]: context.profileId,
      },
    });

    if (existingCount !== parsed.items.length) {
      throw new AppError(
        'One or more items do not belong to your profile',
        ErrorCode.FORBIDDEN,
        403
      );
    }

    // Sequential array transactions cannot raise Prisma's 5s timeout. Run the
    // updates on one interactive transaction instead.
    await db.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writer = tx[modelConfig.clientKey] as any;
      for (const item of parsed.items) {
        await writer.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }
    }, interactiveTransactionOptions);

    logger.info('Reordered items', {
      userId: context.userId,
      model: parsed.model,
      count: parsed.items.length,
    });

    scheduleResumeRefresh(context.profileId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
