/**
 * Keeps the saved model read of a resume's skills in step with the resume.
 * Saves schedule a refresh; a refresh skips the model when no line changed.
 */

import type { Prisma } from '@prisma/client';

import { isAIAvailable } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildEditFacts } from '@/services/ai/resume-edit/facts';
import {
  hashSkillLines,
  readResumeSkillsWithModel,
  readStoredSkillProfile,
} from '@/services/ai/resume-skills';
import { readSkillLines } from '@/services/ai/skills/profile';
import { SKILL_PROFILE_VERSION, type StoredSkillProfile } from '@/services/ai/skills/types';
import { loadEditSource } from '@/services/resume-edit-source';

const log = logger.child({ source: 'resume-skill-profile' });

const inflight = new Map<string, Promise<void>>();

/** The saved read, or null. Never throws: matching works without it, from what the resume names. */
export async function getStoredSkillProfile(profileId: string): Promise<StoredSkillProfile | null> {
  try {
    const row = await db.profile.findUnique({
      where: { id: profileId },
      select: { resumeSkillProfile: true },
    });
    return readStoredSkillProfile(row?.resumeSkillProfile);
  } catch (error) {
    log.error('Could not load the skill read', error, { profileId });
    return null;
  }
}

async function store(profileId: string, profile: StoredSkillProfile): Promise<void> {
  await db.profile.update({
    where: { id: profileId },
    data: { resumeSkillProfile: profile as unknown as Prisma.InputJsonValue },
  });
}

async function writeSkillProfile(profileId: string): Promise<void> {
  const lines = readSkillLines(buildEditFacts(await loadEditSource(profileId)));
  const sourceHash = hashSkillLines(lines);
  const current = await getStoredSkillProfile(profileId);
  if (current?.sourceHash === sourceHash) return;

  if (lines.length === 0) {
    await store(profileId, {
      version: SKILL_PROFILE_VERSION,
      sourceHash,
      generatedAt: new Date().toISOString(),
      lines: {},
      skills: [],
    });
    return;
  }
  if (!isAIAvailable()) {
    log.warn('Skipped skill read; AI is not configured', { profileId });
    return;
  }

  const profile = await readResumeSkillsWithModel(lines);
  if (!profile) {
    log.warn('Skill read was discarded', { profileId });
    return;
  }
  await store(profileId, profile);
  log.info('Skill read saved', { profileId, skills: profile.skills.length });
}

/**
 * Read the resume's skills with the model and save them. A second call for
 * the same resume waits, then runs again, so a save during a read is not
 * dropped. Failures keep the previous read.
 */
export function refreshResumeSkillProfile(profileId: string): Promise<void> {
  const previous = inflight.get(profileId) ?? Promise.resolve();
  const job = previous
    .catch(() => undefined)
    .then(() => writeSkillProfile(profileId))
    .catch((error: unknown) => {
      log.error('Failed to refresh skill read', error, { profileId });
    })
    .finally(() => {
      if (inflight.get(profileId) === job) inflight.delete(profileId);
    });

  inflight.set(profileId, job);
  return job;
}

/** Whether a refresh for this resume is running now. */
export function isSkillProfileRefreshing(profileId: string): boolean {
  return inflight.has(profileId);
}
