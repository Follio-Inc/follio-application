/**
 * Shared access-control for the resume export routes
 * (`/api/export/[handle]/{pdf,json,text}`).
 *
 * This module centralises the resume download access check so it stays in
 * lockstep with the canonical viewer logic in `app/u/[handle]/resume/page.tsx`.
 *
 *   - Owner: always allowed.
 *   - `resumeVisibility === 'PRIVATE'`: owner only.
 *   - `resumeVisibility === 'PUBLIC'`: anyone.
 *   - `resumeVisibility === 'UNLISTED'`: only with a valid share token or
 *     unlisted key.
 */

import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@clerk/nextjs/server';

import { db } from '@/lib/db';
import { validateShareToken } from '@/lib/share-token';
import { validateUnlistedKey } from '@/services/profile.service';

/**
 * The minimal profile shape the access check needs. Both `getProfileByHandle`
 * and `getPublicProfile` satisfy this.
 */
export interface ExportAccessProfile {
  userId: string;
  status: string;
  resumeVisibility: string | null;
}

/**
 * Result of an access check: either the request is allowed, or a ready-to-return
 * `NextResponse` describing why it was denied.
 */
export type ExportAccessResult =
  | { allowed: true; isOwner: boolean }
  | { allowed: false; response: NextResponse };

/**
 * Determine whether the current request is permitted to export the given
 * profile's resume.
 *
 * Mirrors the visibility rules enforced by the public resume page so the
 * download endpoints can never expose data the page would hide.
 */
export async function assertResumeExportAccess(
  request: NextRequest,
  handle: string,
  profile: ExportAccessProfile
): Promise<ExportAccessResult> {
  // Owner check: clerkId -> user.id -> profile.userId.
  const { userId: clerkId } = await auth();
  let isOwner = false;
  if (clerkId) {
    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    isOwner = user?.id === profile.userId;
  }

  if (isOwner) {
    return { allowed: true, isOwner };
  }

  const resumeVisibility = profile.resumeVisibility ?? 'PRIVATE';

  if (resumeVisibility === 'PRIVATE') {
    return {
      allowed: false,
      response: NextResponse.json({ error: 'Resume is not publicly accessible' }, { status: 403 }),
    };
  }

  if (resumeVisibility === 'PUBLIC') {
    return { allowed: true, isOwner };
  }

  // UNLISTED requires a valid share token or unlisted key.
  const token = request.nextUrl.searchParams.get('token');
  const key = request.nextUrl.searchParams.get('key');

  const isValidToken = token ? await validateShareToken(handle, token, 'resume') : false;
  const isValidKey = key ? await validateUnlistedKey(handle, key) : false;

  if (isValidToken || isValidKey) {
    return { allowed: true, isOwner };
  }

  return {
    allowed: false,
    response: NextResponse.json({ error: 'Resume is not publicly accessible' }, { status: 403 }),
  };
}

/**
 * Build a `Content-Disposition` header value with an RFC 5987-encoded filename.
 *
 * Handles (and the resulting filenames) can in principle contain characters
 * that are unsafe in an unencoded `filename="…"` parameter. We always provide
 * an ASCII-safe `filename` fallback plus a UTF-8 `filename*` for modern clients.
 */
export function contentDispositionAttachment(filename: string): string {
  // ASCII fallback: strip anything outside a conservative safe set.
  const asciiFallback = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
