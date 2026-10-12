/**
 * Writes the recruiter glance.
 * Create and save call this. Opening Highlights never does.
 */

import { executeAICall, isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildGlanceFacts, factsAreEmpty } from '@/lib/resume/glance-facts';
import { groundGlance } from '@/lib/resume/glance-ground';
import { buildGlanceUserPrompt, GLANCE_SYSTEM_PROMPT } from '@/lib/resume/glance-prompt';
import { emptyGlance, type ResumeGlance } from '@/lib/resume/glance';
import type { PublicProfile } from '@/types';
import type { Prisma } from '@prisma/client';

const glanceLogger = logger.child({ source: 'resume-glance' });

/** Highlights read experience only. Sections decide what is visible on the resume. */
const PROFILE_INCLUDE = {
  workExperiences: { orderBy: { sortOrder: 'asc' as const } },
  sections: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ProfileInclude;

const inflight = new Map<string, Promise<void>>();

async function storeGlance(profileId: string, glance: ResumeGlance): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: { resumeGlance: glance as unknown as Prisma.InputJsonValue },
  });
}

async function writeResumeGlance(profileId: string): Promise<void> {
  const profile = await db.profile.findUnique({
    where: { id: profileId },
    include: PROFILE_INCLUDE,
  });
  if (!profile) return;

  const facts = buildGlanceFacts(profile as unknown as PublicProfile);

  if (factsAreEmpty(facts)) {
    await storeGlance(profileId, emptyGlance());
    return;
  }

  if (!isAIAvailable()) {
    glanceLogger.warn('Skipped glance refresh; AI is not configured', { profileId });
    return;
  }

  const result = await executeAICall<unknown>({
    stage: 'resumeGlance',
    taskType: 'strategy',
    temperature: 0.2,
    systemPrompt: GLANCE_SYSTEM_PROMPT,
    userPrompt: buildGlanceUserPrompt(facts),
    jsonMode: true,
  });

  await storeGlance(profileId, groundGlance(facts, result.data));
}

/**
 * Run the highlights prompt and store the notes.
 * A second call for the same resume waits, then runs again, so a save
 * during a write is not dropped. Failures leave the previous glance in place.
 */
export function refreshResumeGlance(profileId: string): Promise<void> {
  const previous = inflight.get(profileId) ?? Promise.resolve();
  const job = previous
    .catch(() => undefined)
    .then(() => writeResumeGlance(profileId))
    .catch((error: unknown) => {
      glanceLogger.error('Failed to refresh resume glance', error, { profileId });
    })
    .finally(() => {
      if (inflight.get(profileId) === job) inflight.delete(profileId);
    });

  inflight.set(profileId, job);
  return job;
}
