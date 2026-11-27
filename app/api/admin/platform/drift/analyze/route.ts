import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { analyzeLatestChange } from '@/_admin-panel/platform/drift';
import type { ChangeAnalysis } from '@/_admin-panel/platform/drift';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Analyses the latest commit against the coverage map (Drift intelligence,
 * step 1).
 *
 * Thin shim. Admin auth, then the same local-only gate every other surface
 * that spawns a process uses — reading git history is read-only, but it is
 * still a subprocess, and the public product must never be able to start one.
 *
 * **Takes no input at all.** There is one supported analysis, `HEAD`, so there
 * is no body, no query parameter and no commit id to validate. A range, a sha
 * or a path in a request would have nowhere to go: `analyzeLatestChange`
 * accepts no commit argument and its git argv is a literal in that module.
 * Supporting ranges later means a validated server-side allowlist, not a
 * passthrough.
 *
 * `POST` rather than `GET` even though nothing is mutated: it makes "the
 * server does work here" explicit and keeps the call out of any prefetch,
 * cache or replay path. Reading is the permission every role already carries,
 * so this route adds no role check beyond admin and writes no audit entry —
 * it reports relationships a viewer can already read on the Drift page, and
 * item 19's audit vocabulary is for actions that change something. (The
 * symbol that enforces a higher role is deliberately not named here: the
 * read-route test in `platform-roles.test.ts` greps this file for it.)
 */
export async function POST() {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const analysis: ChangeAnalysis = analyzeLatestChange();

    return NextResponse.json(analysis, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/drift/analyze',
      method: 'POST',
    });
  }
}
