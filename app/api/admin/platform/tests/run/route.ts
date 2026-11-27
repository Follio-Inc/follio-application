import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import {
  auditPlatformAction,
  deniedBody,
  enforcePlatformAction,
} from '@/_admin-panel/platform/auth';
import { isKnownCategory, runCategory } from '@/_admin-panel/platform/tests';
import { observeVitest, recordObservations } from '@/_admin-panel/platform/perf';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RunBody = {
  categoryId?: unknown;
};

/**
 * Runs one coverage-map category's unit tests (PLATFORM_TODO item 12).
 *
 * Thin shim, same shape as `/api/admin/developer/test`: admin auth, then the
 * existing local-only gate, then validate the one piece of input against the
 * trusted map before anything is spawned.
 *
 * The body carries a **category id and nothing else**. The server resolves the
 * files itself, so a caller cannot name a path, pass a Vitest flag or reach a
 * shell. Anything that is not a declared category is a 400.
 *
 * The request stays open for the length of the run and returns the parsed
 * report. Progress while it is open comes from `../active`, and `../cancel`
 * stops it (item 15).
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: runner or maintainer. Before the local-only guard, so a
    // viewer learns their role is insufficient rather than that devtools are
    // disabled — and before the body is read, so a refused caller's payload
    // is never parsed. The refusal is audited against the action.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'tests:run',
      action: 'tests:run',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    const body = (await request.json()) as RunBody;
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId : '';

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'tests:run',
      target: categoryId,
    });

    if (!categoryId || !isKnownCategory(categoryId)) {
      return NextResponse.json({ error: 'Unknown categoryId' }, { status: 400 });
    }

    const result = await runCategory(categoryId);

    // A second run while one is in progress is refused, never queued, and the
    // refusal carries the status code that says so as well as the outcome
    // (PLATFORM_TODO item 15). The lock lives in the runner, so a second
    // caller that skips this route is refused just the same.
    // Item 27: compare each test's duration with its own median. Cannot
    // fail the run — a broken store yields no flags rather than an error.
    const perf = recordObservations(observeVitest(result));

    return NextResponse.json(
      { ...result, perf },
      { status: result.outcome === 'busy' ? 409 : 200 }
    );
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/tests/run',
      method: 'POST',
    });
  }
}
