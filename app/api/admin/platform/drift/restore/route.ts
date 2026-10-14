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
import { invalidateScannerCaches, restoreQuarantined } from '@/_admin-panel/platform/drift';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RestoreBody = {
  quarantineId?: unknown;
};

/**
 * Puts a quarantined artifact back where it came from (PLATFORM_TODO item 19).
 *
 * What makes quarantine a middle state rather than a slow deletion. It takes a
 * **quarantine id and nothing else**; the destination is the original path from
 * the stored record, never a path from the caller, and the engine refuses if
 * anything now occupies it rather than overwriting a file.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: maintainer only, before the guard and before the body.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'drift:restore',
      action: 'restore',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    const body = (await request.json().catch(() => ({}))) as RestoreBody;
    const quarantineId = typeof body.quarantineId === 'string' ? body.quarantineId : '';

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'restore',
      target: quarantineId,
    });

    if (!quarantineId) {
      return NextResponse.json({ error: 'Missing quarantineId' }, { status: 400 });
    }

    const result = restoreQuarantined(quarantineId, {
      actorId: admin.adminId,
      invalidate: invalidateScannerCaches,
    });

    return NextResponse.json(result, { status: result.outcome === 'restored' ? 200 : 409 });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/drift/restore',
      method: 'POST',
    });
  }
}
