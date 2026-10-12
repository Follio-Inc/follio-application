/**
 * After a resume is saved, rewrite what is derived from it: the recruiter
 * glance and the skill read. Both run after the response, so a save stays
 * fast and both are current before the next open.
 * Create paths should await `refreshResumeGlance` instead.
 */

import { after } from 'next/server';

export function scheduleResumeRefresh(profileId: string | null | undefined): void {
  if (!profileId) return;

  const run = () =>
    Promise.all([
      import('@/services/resume-glance.service').then((mod) => mod.refreshResumeGlance(profileId)),
      import('@/services/resume-skill-profile.service').then((mod) =>
        mod.refreshResumeSkillProfile(profileId)
      ),
    ]);

  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}

/** Rewrite only the skill read, e.g. when the builder finds it missing. */
export function scheduleSkillProfileRefresh(profileId: string): void {
  const run = () =>
    import('@/services/resume-skill-profile.service').then((mod) =>
      mod.refreshResumeSkillProfile(profileId)
    );
  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}
