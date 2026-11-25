import { makeProfilePortfolioReady } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

const resumeLogger = logger.child({ source: 'resume-delete' });

export interface DeletedResumes {
  deleted: { id: string; title: string }[];
  /** Set when a deleted resume was open in the builder: the resume opened instead. */
  newActive: { id: string; title: string } | null;
  /** Set when a deleted resume was the portfolio: the resume used for it instead. */
  newPrimary: { id: string; title: string } | null;
}

// this file actually does the deleting work. Is used for the delete_resumes tool as well as the website delete button

/**
 * Permanently deletes some of a user's resumes, with everything in them (the database cascades).
 * The website's Delete button and the MCP delete_resumes tool both use this, so they follow the
 * same rules:
 * - every id must be the user's resume, or nothing is deleted
 * - the user always keeps at least one resume
 * - if the resume open in the builder or the portfolio's resume is deleted, the oldest remaining
 *   resume takes its place (made portfolio-ready first)
 */
export async function deleteResumes(userId: string, resumeIds: string[]): Promise<DeletedResumes> {
  const ids = Array.from(new Set(resumeIds));
  if (ids.length === 0) throw Errors.badRequest('No resume to delete');

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profile: { select: { id: true } },
      primaryProfile: { select: { id: true } },
    },
  });
  if (!user) throw Errors.notFound('User');

  // Verify ownership of every one before deleting any.
  const owned = await db.profile.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, resumeTitle: true },
  });
  if (owned.length !== ids.length) throw Errors.notFound('Resume');

  // Prevent deleting the last resume.
  const resumeCount = await db.profile.count({ where: { userId } });
  if (resumeCount - ids.length < 1) {
    throw Errors.badRequest(
      ids.length === 1 ? 'Cannot delete your only resume' : 'Cannot delete all of your resumes'
    );
  }

  const wasActive = !!user.profile && ids.includes(user.profile.id);
  const wasPrimary = !!user.primaryProfile && ids.includes(user.primaryProfile.id);

  await db.profile.deleteMany({ where: { id: { in: ids }, userId } });

  // Re-point the builder and portfolio at the oldest remaining resume, so the dashboard and
  // builder always resolve to a valid profile.
  let replacement: { id: string; resumeTitle: string } | null = null;
  if (wasActive || wasPrimary) {
    replacement = await db.profile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, resumeTitle: true },
    });

    if (replacement) {
      // The replacement may be a DRAFT resume with no generated portfolio. Make it renderable
      // before it becomes primary, so the portfolio link keeps working.
      if (wasPrimary) await makeProfilePortfolioReady(replacement.id);

      await db.user.update({
        where: { id: userId },
        data: {
          ...(wasActive && { profile: { connect: { id: replacement.id } } }),
          ...(wasPrimary && { primaryProfile: { connect: { id: replacement.id } } }),
        },
      });
    }
  }

  resumeLogger.info('Deleted resumes', { userId, profileIds: ids, wasActive, wasPrimary });

  const view = replacement && { id: replacement.id, title: replacement.resumeTitle };
  return {
    deleted: owned.map((profile) => ({ id: profile.id, title: profile.resumeTitle })),
    newActive: wasActive ? view : null,
    newPrimary: wasPrimary ? view : null,
  };
}
