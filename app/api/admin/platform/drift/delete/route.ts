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
import { deleteQuarantined, invalidateScannerCaches } from '@/_admin-panel/platform/drift';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type DeleteBody = {
  quarantineId?: unknown;
  confirmation?: unknown;
};

/**
 * Deletes a quarantined artifact, with approval (PLATFORM_TODO item 19).
 *
 * The second of the two requests, and it cannot be reached from a finding: the
 * only target it accepts is a **quarantine id**, so a file that was never
 * quarantined has no id to name. Alongside it the caller sends the artifact's
 * **original repository-relative path** as approval, and the engine compares
 * that to the stored record — on the server, not in the browser. A disabled
 * button, a `confirm()` dialog or the mere fact that something is quarantined
 * is not approval.
 *
 * No path, no destination and no command is read from the body, and the
 * approval value itself is never written to the audit trail: the trail records
 * that the original path was confirmed, not what was typed.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: maintainer only, before the guard and before the body. The
    // typed approval below is unchanged — the role is an extra gate, not a
    // replacement for it.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'drift:delete',
      action: 'delete',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    const body = (await request.json().catch(() => ({}))) as DeleteBody;
    const quarantineId = typeof body.quarantineId === 'string' ? body.quarantineId : '';
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'delete',
      target: quarantineId,
    });

    if (!quarantineId) {
      return NextResponse.json({ error: 'Missing quarantineId' }, { status: 400 });
    }

    const result = deleteQuarantined(quarantineId, confirmation, {
      actorId: admin.adminId,
      invalidate: invalidateScannerCaches,
    });

    return NextResponse.json(result, { status: result.outcome === 'deleted' ? 200 : 409 });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/drift/delete',
      method: 'POST',
    });
  }
}
