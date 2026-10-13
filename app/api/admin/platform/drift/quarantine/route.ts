import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { invalidateScannerCaches, quarantineCandidate } from '@/_admin-panel/platform/drift';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type QuarantineBody = {
  candidateId?: unknown;
};

/**
 * Moves one proven-unreachable file out of the tree (PLATFORM_TODO item 19).
 *
 * Thin shim: admin auth, then the same local-only gate every other mutating
 * surface uses, then one id.
 *
 * The body carries a **server-derived candidate id and nothing else**. The id
 * is re-resolved against a scan run inside the handler, so the path comes from
 * the repository as it is now — a path, a destination or a command in the body
 * would have nowhere to go. This does not delete: deleting needs a second
 * request to `../delete`, carrying the artifact's original path as approval.
 *
 * The admin's `Admin.id` is recorded as the actor. Not their Clerk id, not
 * their email, and never a token.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertCanRunDeveloperSuites();

    const body = (await request.json().catch(() => ({}))) as QuarantineBody;
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';

    if (!candidateId) {
      return NextResponse.json({ error: 'Missing candidateId' }, { status: 400 });
    }

    const result = quarantineCandidate(candidateId, {
      actorId: admin.adminId,
      invalidate: invalidateScannerCaches,
    });

    return NextResponse.json(result, {
      status: result.outcome === 'quarantined' ? 200 : 409,
    });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/drift/quarantine',
      method: 'POST',
    });
  }
}
