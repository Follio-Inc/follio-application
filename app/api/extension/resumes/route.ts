import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { handleApiError } from '@/lib/errors';

function extensionAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'http://localhost:3000';
  return raw.replace(/\/$/, '');
}

/**
 * GET /api/extension/resumes
 *
 * Resume library for the Chrome extension (Dropbox-style list + view/download URLs).
 * Auth: Clerk session cookies (extension host_permissions + credentials: 'include').
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: {
        id: true,
        profile: { select: { id: true } },
        primaryProfile: { select: { id: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const activeProfileId = user.profile?.id ?? null;
    const primaryProfileId = user.primaryProfile?.id ?? null;

    const resumes = await db.profile.findMany({
      where: {
        userId: user.id,
        isArchived: false,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        handle: true,
        resumeTitle: true,
        status: true,
        resumeVisibility: true,
        firstName: true,
        lastName: true,
        headline: true,
        updatedAt: true,
      },
    });

    const origin = extensionAppOrigin();

    return NextResponse.json({
      resumes: resumes.map((r) => ({
        id: r.id,
        handle: r.handle,
        resumeTitle: r.resumeTitle,
        status: r.status,
        resumeVisibility: r.resumeVisibility,
        firstName: r.firstName,
        lastName: r.lastName,
        headline: r.headline,
        updatedAt: r.updatedAt,
        isActive: r.id === activeProfileId,
        isPrimary: r.id === primaryProfileId,
        viewUrl: `${origin}/api/export/${encodeURIComponent(r.handle)}/pdf?layout=letter`,
        downloadUrl: `${origin}/api/export/${encodeURIComponent(r.handle)}/pdf?layout=letter`,
        openInFollioUrl: `${origin}/resumes`,
      })),
      activeProfileId,
      primaryProfileId,
      appUrl: origin,
    });
  } catch (error) {
    return handleApiError(error, { method: 'GET', path: '/api/extension/resumes' });
  }
}
