/**
 * After a resume is saved, rewrite what is derived from it: the recruiter
 * glance and the skill read. Both run after the response, so a save stays
 * fast and both are current before the next open.
 * Create paths should await `refreshResumeGlance` instead.
 */

import { after } from 'next/server';

import { logger } from '@/lib/logger';

const refreshLogger = logger.child({ source: 'resume-refresh' });

/**
 * Start one piece of background refresh work so that it cannot reject into
 * nothing.
 *
 * `void somePromise` leaves a rejection with no handler. For work that is
 * deliberately not awaited — which is the whole point of this module — that
 * means a database blip or a slow model call inside the refresh surfaces as
 * an unhandled promise rejection in the server process, far from the request
 * that caused it and attributable to nothing. Node reports those on stderr
 * and some runtimes treat them as fatal.
 *
 * Every refresh here is best-effort by design: the resume itself is already
 * saved, and a stale glance is corrected by the next save. So the right
 * handling is to record the failure and carry on, which is what this does.
 */
function runDetached(label: string, profileId: string, work: () => Promise<unknown>): void {
  const start = () => {
    void work().catch((error: unknown) => {
      refreshLogger.warn('Background resume refresh failed', {
        label,
        profileId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  try {
    // `after` runs the work once the response is sent. It throws when there is
    // no request scope — a script, a test, a non-request code path — and the
    // fallback simply starts the work now.
    after(start);
  } catch {
    start();
  }
}

export function scheduleResumeRefresh(profileId: string | null | undefined): void {
  if (!profileId) return;

  runDetached('resume', profileId, () =>
    // `allSettled`, not `all`: with `all`, a rejection from the first import
    // settles the combined promise while the second is still in flight, so
    // that one's rejection would have no handler left to reach — the exact
    // problem this function exists to prevent, reintroduced one level down.
    Promise.allSettled([
      import('@/services/resume-glance.service').then((mod) => mod.refreshResumeGlance(profileId)),
      import('@/services/resume-skill-profile.service').then((mod) =>
        mod.refreshResumeSkillProfile(profileId)
      ),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          refreshLogger.warn('Background resume refresh failed', {
            profileId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      }
    })
  );
}

/** Rewrite only the skill read, e.g. when the builder finds it missing. */
export function scheduleSkillProfileRefresh(profileId: string): void {
  if (!profileId) return;

  runDetached('skill-profile', profileId, () =>
    import('@/services/resume-skill-profile.service').then((mod) =>
      mod.refreshResumeSkillProfile(profileId)
    )
  );
}
