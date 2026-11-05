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
import { getLiveQaPathway } from '@/_admin-panel/modules/developer/live-qa';
import { runPathway } from '@/_admin-panel/platform/tests';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RunBody = {
  pathwayId?: unknown;
};

/**
 * Runs one Live QA pathway (PLATFORM_TODO item 14).
 *
 * Same shape as the existing `/api/admin/developer/live-qa/run`: admin auth,
 * then the local-only gate, then validate the one piece of input against the
 * trusted catalog before anything is spawned.
 *
 * The body carries a **pathway id and nothing else**. The spec path, the
 * Playwright config and every flag come from the existing runner, so a caller
 * cannot name a file or reach a shell.
 *
 * The request stays open for the length of the run and returns the parsed
 * report. Progress while it is open comes from `../../active`, and
 * `../../cancel` stops it (item 15).
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: runner or maintainer, before the guard and before the body.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'live-qa:run',
      action: 'live-qa:run',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    const body = (await request.json()) as RunBody;
    const pathwayId = typeof body.pathwayId === 'string' ? body.pathwayId : '';

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'live-qa:run',
      target: pathwayId,
    });

    if (!pathwayId || !getLiveQaPathway(pathwayId)) {
      return NextResponse.json({ error: 'Unknown pathwayId' }, { status: 400 });
    }

    const result = await runPathway(pathwayId);

    // A second run while one is in progress is refused, never queued — and
    // Live QA shares the one slot with the Vitest runner (PLATFORM_TODO
    // item 15).
    return NextResponse.json(result, { status: result.outcome === 'busy' ? 409 : 200 });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/tests/live-qa/run',
      method: 'POST',
    });
  }
}
