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
// Imported from the module rather than the lab's barrel: the openresume
// parser cannot be bundled by Turbopack (see the barrel's note), and routing
// it through the barrel would break the lab page and the single-run route
// too. This endpoint is the only thing that needs it.
import { runResumeComparison } from '@/_admin-panel/platform/labs/resume-import-ai/compare-runner';
import { MAX_UPLOAD_BYTES } from '@/_admin-panel/platform/labs/resume-import-ai/runner';
import { observeComparison, recordObservations } from '@/_admin-panel/platform/perf';
import type { ResumeComparisonResult } from '@/_admin-panel/platform/labs/resume-import-ai';
import { admitLabRun, reconcileLabRun, releaseLabRun } from '@/_admin-panel/platform/cost';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Runs one document through both resume parsers and compares them
 * (PLATFORM_TODO item 23).
 *
 * Thin shim, and the same shape as the single-run route beside it: admin
 * auth, then the local-only gate, then one of two inputs.
 *
 * **The server decides which two parsers run.** The body is multipart and the
 * only things read from it are a **fixture id** or an uploaded **file**. No
 * parser name, module path, function name, filesystem path, command or model
 * override is accepted from the caller, and adding one would turn a
 * diagnostic into an arbitrary-code endpoint.
 *
 * Neither parser writes product data: the AI side omits `saveToProfile`, and
 * the openresume side is entered through its pure boundary rather than
 * `importResumeFromPdf`, which would create a `RawImportPayload` row.
 */
/**
 * Per-stage performance flags (item 27).
 *
 * Each parser is keyed by its own side, so the AI and OpenResume series are
 * separate baselines. Neither is compared with the other: item 23 declined to
 * name a winner, and "slower than the other parser" is not a regression.
 */
function withPerf(result: ResumeComparisonResult): ResumeComparisonResult {
  return { ...result, perf: recordObservations(observeComparison(result)) };
}

/**
 * Settles the comparison's provider cost (item 29).
 *
 * Only the AI side can have cost, and only if it reached the provider. The
 * OpenResume side's outcome is irrelevant here: a comparison where that side
 * failed and the AI side ran still spent what the AI side spent.
 */
function settleCost(
  result: ResumeComparisonResult,
  admission: { reservationId: string | null; projectedMaxUsd: number | null },
  actor: { adminId: string; role: string }
): void {
  const ai = result.ai;
  const reachedProvider = ai !== null && (ai.outcome === 'parsed' || ai.ai !== null);

  if (!reachedProvider) {
    releaseLabRun(admission.reservationId);
    return;
  }

  reconcileLabRun({
    runId: `compare:${actor.adminId}:${result.comparison?.summary.sourceSha256.slice(0, 16) ?? Date.now()}`,
    reservationId: admission.reservationId,
    kind: 'lab-compare',
    ai: ai.ai,
    projectedMaxUsd: admission.projectedMaxUsd,
    actorId: actor.adminId,
    actorRole: actor.role,
  });
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    // Item 28: runner or maintainer, and the local-only guard, **both before
    // the multipart body is touched**. `request.formData()` buffers and
    // parses up to 5 MB; a refused caller, or a production deployment, must
    // never pay for that just so the audit line can name a fixture.
    const authz = await enforcePlatformAction({
      adminId: admin.adminId,
      permission: 'labs:compare',
      action: 'labs:compare',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    // Item 29: a comparison runs the AI pipeline as one of its two sides, so
    // that side costs exactly what a single run costs and is reserved the
    // same way. The OpenResume side makes **no provider call** — item 23's
    // distinction — so nothing is reserved for it and it is never recorded
    // as `$0 AI`.
    const admission = admitLabRun({
      kind: 'lab-compare',
      actorId: admin.adminId,
      actorRole: authz.role,
    });
    if (!admission.allowed) {
      auditPlatformAction({
        adminId: admin.adminId,
        role: authz.role,
        action: 'labs:compare',
        target: `cost:${admission.status}`,
        result: 'refused',
        reason: admission.status,
      });
      return NextResponse.json(
        { error: admission.detail, reason: admission.status, cost: admission.spend },
        { status: 429 }
      );
    }

    const form = await request.formData().catch(() => null);
    if (form === null) {
      return NextResponse.json({ error: 'Expected a multipart form' }, { status: 400 });
    }

    const fixtureId = form.get('fixtureId');
    const file = form.get('file');

    auditPlatformAction({
      adminId: admin.adminId,
      role: authz.role,
      action: 'labs:compare',
      target: typeof fixtureId === 'string' && fixtureId.length > 0 ? fixtureId : 'upload',
    });

    if (typeof fixtureId === 'string' && fixtureId.length > 0) {
      const result = await runResumeComparison(
        { source: 'fixture', fixtureId },
        { userId: admin.adminId }
      );
      settleCost(result, admission, { adminId: admin.adminId, role: authz.role });
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'compared' ? 200 : 409,
      });
    }

    if (file instanceof File) {
      if (file.size > MAX_UPLOAD_BYTES) {
        releaseLabRun(admission.reservationId);
        return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 413 });
      }

      const result = await runResumeComparison(
        {
          source: 'upload',
          bytes: Buffer.from(await file.arrayBuffer()),
          // A label only. Never joined to a path.
          filename: file.name,
          declaredType: file.type,
        },
        { userId: admin.adminId }
      );
      settleCost(result, admission, { adminId: admin.adminId, role: authz.role });
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'compared' ? 200 : 409,
      });
    }

    releaseLabRun(admission.reservationId);
    return NextResponse.json({ error: 'Send either a fixtureId or a PDF file' }, { status: 400 });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/labs/resume-import-ai/compare',
      method: 'POST',
    });
  }
}
