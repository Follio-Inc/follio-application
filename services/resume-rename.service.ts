import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

const renameLogger = logger.child({ source: 'resume-rename' });

export const DUPLICATE_RESUME_TITLE_MESSAGE =
  'A resume with this name already exists. Please choose a different name.';

export interface RenamedResume {
  id: string;
  handle: string;
  oldTitle: string;
  title: string;
}

// function for renaming resume
export async function renameResume(
  userId: string,
  resumeId: string,
  newTitle: string
): Promise<RenamedResume> {
  const title = newTitle.trim();
  if (!title) throw Errors.badRequest('Title is required');

  const profile = await db.profile.findFirst({
    where: { id: resumeId, userId },
    select: { id: true, handle: true, resumeTitle: true },
  });
  if (!profile) throw Errors.notFound('Resume');

  // Same title: nothing to change.
  if (profile.resumeTitle === title) {
    return { id: profile.id, handle: profile.handle, oldTitle: title, title };
  }

  const duplicate = await db.profile.findFirst({
    where: { userId, resumeTitle: title, isArchived: false, id: { not: profile.id } },
    select: { id: true },
  });
  if (duplicate) throw Errors.conflict(DUPLICATE_RESUME_TITLE_MESSAGE);

  await db.profile.update({ where: { id: profile.id }, data: { resumeTitle: title } });

  renameLogger.info('Renamed resume', { userId, profileId: profile.id });
  return { id: profile.id, handle: profile.handle, oldTitle: profile.resumeTitle, title };
}
