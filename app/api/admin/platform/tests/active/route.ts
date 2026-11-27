import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { getActiveRun } from '@/_admin-panel/platform/tests';
import type { ExecutionStatus } from '@/_admin-panel/platform/tests';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The one run in progress, if there is one (PLATFORM_TODO item 15).
 *
 * Thin shim. Admin auth and the same local-only gate as every other runner
 * surface: a status endpoint that reports what is executing is part of the
 * execution surface, not a public one.
 *
 * Takes no input at all — there is only ever one active run — and returns a
 * snapshot carrying the opaque run id, the runner, the target id, the lifecycle
 * and the measured elapsed time. No pid, no command, no argv, no path. The run
 * panels poll this while a run is in flight; the final result still comes back
 * on the start request, from Vitest's JSON reporter or Playwright's
 * `report.json`.
 */
export async function GET() {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const status: ExecutionStatus = { active: getActiveRun() };

    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/tests/active',
      method: 'GET',
    });
  }
}
