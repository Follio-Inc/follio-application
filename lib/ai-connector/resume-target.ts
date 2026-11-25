import { z } from 'zod';

import { db } from '@/lib/db';
import { Errors } from '@/lib/errors';

export const RESUME_ID_DESCRIPTION =
  'From list_resumes. The resume the user named (id, handle, or unique title). Required. Do not guess, and do not use a different resume than the one they named.';

export const ResumeRefSchema = z.object({
  resumeId: z
    .string({
      required_error: 'Call list_resumes first, then pass resumeId for the resume the user named.',
    })
    .trim()
    .min(1, 'Call list_resumes first, then pass resumeId for the resume the user named.')
    .max(120),
});

export const CreateResumeSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

export const CloneResumeSchema = ResumeRefSchema.extend({
  title: z.string().trim().min(1).max(120).optional(),
});

export const RenameResumeSchema = ResumeRefSchema.extend({
  title: z
    .string({ required_error: 'Pass the new title as title.' })
    .trim()
    .min(1, 'Pass the new title as title.')
    .max(120),
});

export const MAX_RESUMES_PER_DELETE = 10;

export const DeleteResumesSchema = z.object({
  resumes: z
    .array(
      ResumeRefSchema.extend({
        confirmTitle: z
          .string({ required_error: 'Pass the exact title of each resume as confirmTitle.' })
          .trim()
          .min(1, 'Pass the exact title of each resume as confirmTitle.')
          .max(120),
      })
    )
    .min(1, 'Name at least one resume to delete.')
    .max(MAX_RESUMES_PER_DELETE, `Delete at most ${MAX_RESUMES_PER_DELETE} resumes at a time.`),
});

export type ResumeRef = z.infer<typeof ResumeRefSchema>;
export type RenameResumeInput = z.infer<typeof RenameResumeSchema>;
export type DeleteResumesInput = z.infer<typeof DeleteResumesSchema>;

export interface ResumeCatalogItem {
  resumeId: string;
  title: string;
  handle: string;
  headline: string | null;
  status: string;
  visibility: string;
  updatedAt: string;
  isActive: boolean;
}

export type ResumeMatch = { ok: true; resume: ResumeCatalogItem } | { ok: false; message: string };

/**
 * Pick one of the user's resumes. Id wins, then handle, then unique title.
 * Never falls back to the active resume.
 */
export function matchOwnedResume(resumes: ResumeCatalogItem[], resumeRef: string): ResumeMatch {
  const ref = resumeRef.trim();
  if (!ref) {
    return { ok: false, message: 'Call list_resumes first, then pass resumeId.' };
  }

  if (resumes.length === 0) {
    return { ok: false, message: 'This account has no resumes yet.' };
  }

  const byId = resumes.find((resume) => resume.resumeId === ref);
  if (byId) return { ok: true, resume: byId };

  const byHandle = resumes.filter((resume) => resume.handle === ref);
  if (byHandle.length === 1) return { ok: true, resume: byHandle[0] };

  const lower = ref.toLowerCase();
  const byTitle = resumes.filter((resume) => resume.title.toLowerCase() === lower);
  if (byTitle.length === 1) return { ok: true, resume: byTitle[0] };
  if (byTitle.length > 1) {
    const options = byTitle.map((resume) => `${resume.resumeId} (${resume.handle})`).join(', ');
    return {
      ok: false,
      message: `Several resumes are titled “${ref}”. Pass the resumeId of the one you mean: ${options}.`,
    };
  }

  return {
    ok: false,
    message: `No resume matches “${ref}”. Call list_resumes and pass resumeId.`,
  };
}

export type DeleteCheck =
  | { ok: true; resumes: ResumeCatalogItem[] }
  | { ok: false; message: string };

/**
 * The safety check before deleting: each resume must be found AND its title must match
 * confirmTitle exactly (only spaces at the ends are ignored). If any one fails, nothing is
 * deleted. The real title is never echoed back, so a wrong guess can't just be retried with it:
 * the assistant has to check with the user.
 */
export function checkResumesToDelete(
  resumes: ResumeCatalogItem[],
  requests: DeleteResumesInput['resumes']
): DeleteCheck {
  const problems: string[] = [];
  const matched = new Map<string, ResumeCatalogItem>();

  for (const request of requests) {
    const match = matchOwnedResume(resumes, request.resumeId);
    if (!match.ok) {
      problems.push(match.message);
      continue;
    }
    if (match.resume.title.trim() !== request.confirmTitle.trim()) {
      problems.push(
        `“${request.confirmTitle}” is not the exact title of resume ${match.resume.resumeId}.`
      );
      continue;
    }
    matched.set(match.resume.resumeId, match.resume);
  }

  if (problems.length > 0) {
    return {
      ok: false,
      message: `Nothing was deleted. ${problems.join(' ')} Ask the user which resumes they mean and their exact titles, then try again.`,
    };
  }
  return { ok: true, resumes: Array.from(matched.values()) };
}

export async function listOwnedResumes(userId: string): Promise<ResumeCatalogItem[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { profile: { select: { id: true } } },
  });

  const rows = await db.profile.findMany({
    where: { userId, isArchived: false },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      handle: true,
      resumeTitle: true,
      headline: true,
      status: true,
      resumeVisibility: true,
      updatedAt: true,
    },
  });

  const activeId = user?.profile?.id ?? null;

  return rows.map((row) => ({
    resumeId: row.id,
    title: row.resumeTitle,
    handle: row.handle,
    headline: row.headline,
    status: row.status,
    visibility: row.resumeVisibility,
    updatedAt: row.updatedAt.toISOString(),
    isActive: row.id === activeId,
  }));
}

export async function requireOwnedResume(
  userId: string,
  resumeRef: string
): Promise<ResumeCatalogItem> {
  const resumes = await listOwnedResumes(userId);
  const match = matchOwnedResume(resumes, resumeRef);
  if (!match.ok) {
    throw Errors.badRequest(match.message);
  }
  return match.resume;
}
