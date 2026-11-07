import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { isAIAvailable } from '@/lib/ai-client';
import { Errors, handleApiError } from '@/lib/errors';
import { scheduleSkillProfileRefresh } from '@/lib/resume/schedule-refresh';
import {
  getStoredSkillProfile,
  isSkillProfileRefreshing,
} from '@/services/resume-skill-profile.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/profile/skill-profile
 * The saved skill read for the active resume. Never waits on the model: a
 * missing read is started after the response, and `pending` tells the
 * builder to ask again.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) throw Errors.unauthorized();

    const { profileId } = await resolveActiveProfileContext(userId);
    if (!profileId) throw Errors.notFound('Resume');

    const profile = await getStoredSkillProfile(profileId);
    const canRead = isAIAvailable();
    if (!profile && canRead && !isSkillProfileRefreshing(profileId)) {
      scheduleSkillProfileRefresh(profileId);
    }

    return NextResponse.json({
      profile,
      pending: canRead && (!profile || isSkillProfileRefreshing(profileId)),
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/profile/skill-profile', method: 'GET' });
  }
}
