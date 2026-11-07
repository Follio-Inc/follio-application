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

export type ResumeRef = z.infer<typeof ResumeRefSchema>;

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
