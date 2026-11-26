import { db } from '@/lib/db';
import { interactiveTransactionOptions } from '@/lib/db-transaction';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

const activationLogger = logger.child({ source: 'resume-activation' });

export interface ActivatedResume {
  id: string;
  title: string;
}

/**
 * Makes one of the user's resumes the "active" one: the resume /builder shows. Used by the
 * website (PATCH /api/resumes/[resumeId]/activate, behind the Edit/Open buttons) and the MCP
 * open_in_builder tool. Archived resumes can't be opened.
 */
export async function activateResume(userId: string, resumeId: string): Promise<ActivatedResume> {
  const target = await db.profile.findFirst({
    where: { id: resumeId, userId, isArchived: false },
    select: { id: true, resumeTitle: true },
  });
  if (!target) throw Errors.notFound('Resume');

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { profile: { connect: { id: target.id } } },
    });
  }, interactiveTransactionOptions);

  activationLogger.info('Activated resume', { userId, profileId: target.id });
  return { id: target.id, title: target.resumeTitle };
}
