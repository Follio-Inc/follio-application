import { db } from '@/lib/db';
import { AppError, ErrorCode, isAppError } from '@/lib/errors';

interface ActiveProfileContext {
  userId: string;
  profileId: string;
}

export async function resolveActiveProfileContext(clerkId: string): Promise<ActiveProfileContext> {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      profile: { select: { id: true } },
    },
  });

  if (!user) {
    throw new AppError('User not found', ErrorCode.NOT_FOUND, 404);
  }

  if (user.profile?.id) {
    return { userId: user.id, profileId: user.profile.id };
  }

  const fallback = await db.profile.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!fallback) {
    throw new AppError('Profile not found', ErrorCode.NOT_FOUND, 404);
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      profile: {
        connect: { id: fallback.id },
      },
    },
  });

  return { userId: user.id, profileId: fallback.id };
}

export async function resolveActiveProfileContextOrNull(
  clerkId: string
): Promise<ActiveProfileContext | null> {
  try {
    return await resolveActiveProfileContext(clerkId);
  } catch (error) {
    if (isAppError(error) && error.code === ErrorCode.NOT_FOUND) {
      return null;
    }

    throw error;
  }
}
