import type { Prisma } from '@prisma/client';

const MONTH_ABBREVS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Format a default resume title: "Resume-Mon-DD-YY" (e.g. "Resume-Jul-03-26"). */
export function formatDefaultResumeTitle(date: Date = new Date()): string {
  const month = MONTH_ABBREVS[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = (date.getFullYear() % 100).toString().padStart(2, '0');
  return `Resume-${month}-${day}-${year}`;
}

/** Append an optional duplicate suffix. Sequence 1 returns the base title unchanged. */
export function withResumeTitleSequence(baseTitle: string, sequence: number): string {
  if (sequence <= 1) return baseTitle;
  return `${baseTitle}-${sequence}`;
}

/**
 * PDF download filename (without extension) matches the resume's current title.
 * Unsafe filesystem characters are sanitized. Falls back to "Resume".
 * The OS handles duplicate downloads.
 */
export function formatResumeDownloadFilename(resumeTitle?: string | null): string {
  const sanitized = (resumeTitle ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return sanitized || 'Resume';
}

type ResumeTitleDbClient = Pick<Prisma.TransactionClient, 'profile'>;

/**
 * Generate a unique resume title for a user.
 * Auto-generated titles use "Resume-Mon-DD-YY" with optional "-N" (N >= 2).
 * Custom titles receive the same suffix when a duplicate already exists.
 */
export async function generateUniqueResumeTitle(
  tx: ResumeTitleDbClient,
  userId: string,
  requestedTitle?: string
): Promise<string> {
  const baseTitle = requestedTitle?.trim() || formatDefaultResumeTitle();

  const titleExists = async (title: string): Promise<boolean> => {
    const found = await tx.profile.findFirst({
      where: { userId, resumeTitle: title, isArchived: false },
      select: { id: true },
    });
    return !!found;
  };

  if (!(await titleExists(baseTitle))) return baseTitle;

  for (let sequence = 2; sequence <= 100; sequence += 1) {
    const candidate = withResumeTitleSequence(baseTitle, sequence);
    if (!(await titleExists(candidate))) return candidate;
  }

  return withResumeTitleSequence(baseTitle, 101);
}
