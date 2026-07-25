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

const MONTH_PATTERN = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

/** Exact auto-generated base: "Resume-Mon-DD-YY" (no sequence suffix). */
const DEFAULT_RESUME_TITLE_BASE = new RegExp(`^Resume-(${MONTH_PATTERN})-\\d{2}-\\d{2}$`);

/**
 * Auto-generated title including optional same-day sequence:
 * "Resume-Mon-DD-YY" or "Resume-Mon-DD-YY_02" (also accepts legacy "-N").
 */
const DEFAULT_RESUME_TITLE_PATTERN = new RegExp(
  `^Resume-(${MONTH_PATTERN})-\\d{2}-\\d{2}(_\\d{2}|-\\d+)?$`
);

/** Format a default resume title: "Resume-Mon-DD-YY" (e.g. "Resume-Jul-03-26"). */
export function formatDefaultResumeTitle(date: Date = new Date()): string {
  const month = MONTH_ABBREVS[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = (date.getFullYear() % 100).toString().padStart(2, '0');
  return `Resume-${month}-${day}-${year}`;
}

/** Strip same-day sequence suffix from a date-pattern title, if present. */
export function getDefaultResumeTitleBase(title: string): string | null {
  const match = title
    .trim()
    .match(new RegExp(`^(Resume-(?:${MONTH_PATTERN})-\\d{2}-\\d{2})(?:_\\d{2}|-\\d+)?$`));
  return match?.[1] ?? null;
}

/** True when the title matches the auto-generated date pattern (optional _NN / legacy -N). */
export function isDefaultResumeTitlePattern(title: string): boolean {
  return DEFAULT_RESUME_TITLE_PATTERN.test(title.trim());
}

/**
 * Append a same-day / duplicate sequence suffix.
 * Date-pattern bases use zero-padded "_02"; other titles use "-N".
 * Sequence 1 returns the base title unchanged.
 */
export function withResumeTitleSequence(baseTitle: string, sequence: number): string {
  if (sequence <= 1) return baseTitle;
  if (DEFAULT_RESUME_TITLE_BASE.test(baseTitle.trim())) {
    return `${baseTitle}_${sequence.toString().padStart(2, '0')}`;
  }
  return `${baseTitle}-${sequence}`;
}

/**
 * Next available default title for a date among existing titles.
 * First: "Resume-Jul-25-26"; same-day duplicates: "Resume-Jul-25-26_02", "_03", …
 */
export function suggestDefaultResumeTitle(
  date: Date = new Date(),
  existingTitles: readonly string[] = []
): string {
  const baseTitle = formatDefaultResumeTitle(date);
  const existing = new Set(existingTitles.map((title) => title.trim().toLowerCase()));

  if (!existing.has(baseTitle.toLowerCase())) return baseTitle;

  for (let sequence = 2; sequence <= 100; sequence += 1) {
    const candidate = withResumeTitleSequence(baseTitle, sequence);
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }

  return withResumeTitleSequence(baseTitle, 101);
}

/**
 * Suggested prefill when cloning a resume.
 * - Date-pattern sources → today's date title, with _02 / _03 if that date is taken
 * - Custom/renamed sources → "{name}_2" (or increment an existing trailing _N)
 */
export function suggestCloneResumeTitle(
  sourceTitle: string,
  date: Date = new Date(),
  existingTitles: readonly string[] = []
): string {
  const trimmed = sourceTitle.trim();
  if (!trimmed || isDefaultResumeTitlePattern(trimmed)) {
    return suggestDefaultResumeTitle(date, existingTitles);
  }

  const numbered = trimmed.match(/^(.*)_(\d+)$/);
  if (numbered) {
    const base = numbered[1] ?? trimmed;
    const next = Number(numbered[2]) + 1;
    return `${base}_${next}`;
  }

  return `${trimmed}_2`;
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
 * Auto-generated titles use "Resume-Mon-DD-YY" with optional "_02" (N >= 2) for same-day duplicates.
 * Custom titles receive a "-N" suffix when a duplicate already exists.
 */
export async function generateUniqueResumeTitle(
  tx: ResumeTitleDbClient,
  userId: string,
  requestedTitle?: string
): Promise<string> {
  const rawTitle = requestedTitle?.trim() || formatDefaultResumeTitle();
  const dateBase = getDefaultResumeTitleBase(rawTitle);
  const baseTitle = dateBase ?? rawTitle;

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
