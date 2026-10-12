import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { GLANCE_VERSION, parseResumeGlance } from '@/lib/resume/glance';
import { scheduleResumeRefresh } from '@/lib/resume/schedule-refresh';

/**
 * GET /api/profile/glance
 * Read the glance already stored for the active resume.
 * This route never waits on the prompt; an outdated glance is rewritten after the response.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = await db.profile.findUnique({
      where: { id: profileId },
      select: { resumeGlance: true },
    });

    const stored = profile?.resumeGlance;
    // A resume that was never highlighted, or was highlighted before marker
    // phrases existed, is written once in the background. This read still
    // returns what is stored; the builder asks again while it waits.
    if (!stored || (stored as { version?: unknown }).version !== GLANCE_VERSION) {
      scheduleResumeRefresh(profileId);
    }

    return NextResponse.json({
      glance: parseResumeGlance(stored),
    });
  } catch (error) {
    console.error('Error reading resume glance:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
