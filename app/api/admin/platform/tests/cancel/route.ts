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
import { requestCancel } from '@/_admin-panel/platform/tests';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CancelBody = {
  runId?: unknown;
};

/**
 * Stops the run in progress (PLATFORM_TODO item 15).
 *
 * Thin shim, same shape as the start routes: admin auth, then the local-only
 * gate, then one piece of input.
 *
 * The body carries an **opaque run id and nothing else**. The id is matched
 * against the run that currently holds the console's execution slot, and only
 * that run's process tree is stopped — a stale id from a reloaded page cannot
 * reach a different run, and a pid, a process name, a command or a path cannot
 * be sent at all. The registry derives the thing to kill from the child it was
 * handed when it spawned it.
 *
 * Returns what came of the request rather than an empty 204, because
 * `cancel-failed` and `not-the-active-run` are states an operator needs to see.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: runner or maintainer, before the guard and before the body.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'tests:cancel',
      action: 'tests:cancel',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    const body = (await request.json().catch(() => ({}))) as CancelBody;
    const runId = typeof body.runId === 'string' ? body.runId : '';

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'tests:cancel',
      target: runId,
    });

    if (!runId) {
      return NextResponse.json({ error: 'Missing runId' }, { status: 400 });
    }

    return NextResponse.json(await requestCancel(runId));
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/tests/cancel',
      method: 'POST',
    });
  }
}
