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
import { MAX_UPLOAD_BYTES, runResumeLab } from '@/_admin-panel/platform/labs/resume-import-ai';
import { observeResumeLab, recordObservations } from '@/_admin-panel/platform/perf';
import type { ResumeLabRunResult } from '@/_admin-panel/platform/labs/resume-import-ai';
import { admitLabRun, reconcileLabRun, releaseLabRun } from '@/_admin-panel/platform/cost';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Runs the shipped resume-import pipeline once, as a diagnostic
 * (PLATFORM_TODO item 21).
 *
 * Thin shim: admin auth, then the same local-only gate every other executing
 * surface uses, then one of two inputs.
 *
 * The body is multipart, and the only things read from it are a **fixture id**
 * or an uploaded **file**. No path, no destination and no option is taken from
 * the caller: the fixture is resolved against the committed pool by id, and an
 * upload is held in memory for the length of the request and never written
 * anywhere. The uploaded bytes do not come back in the response.
 *
 * It saves nothing. `saveToProfile` is never passed to the agent, so the
 * agent's save step is a no-op and no product table is touched.
 */
/**
 * Per-stage performance flags (item 27).
 *
 * The lab already measured every stage; this compares each one with its own
 * median and attaches the verdict. It cannot fail the run — `recordObservations`
 * swallows a broken store and returns no flags.
 */
function withPerf(result: ResumeLabRunResult): ResumeLabRunResult {
  return { ...result, perf: recordObservations(observeResumeLab(result)) };
}

/**
 * Settles the run's provider cost against the reservation (item 29).
 *
 * A run that never reached the provider releases its hold; one that did keeps
 * whatever part of it the telemetry could not price. Either way the ledger
 * stops holding budget for a run that has finished.
 */
function settleCost(
  result: ResumeLabRunResult,
  admission: { reservationId: string | null; projectedMaxUsd: number | null },
  actor: { adminId: string; role: string }
): void {
  // The outcomes that stop before `runResumeParseAgent` spend nothing.
  const reachedProvider = result.outcome === 'parsed' || result.outcome === 'agent-failed';

  if (!reachedProvider) {
    releaseLabRun(admission.reservationId);
    return;
  }

  reconcileLabRun({
    runId: result.agentRunId ?? `${actor.adminId}:${Date.now()}`,
    reservationId: admission.reservationId,
    kind: 'lab-run',
    ai: result.ai,
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
      permission: 'labs:run',
      action: 'labs:run',
    });
    if (!authz.allowed) return NextResponse.json(deniedBody(authz), { status: authz.status });

    assertCanRunDeveloperSuites();

    // Item 29: reserve this run's conservative maximum before the multipart
    // body is touched, so a day at the cap costs nothing to refuse — no PDF
    // parsed, no provider call, and no budget held by a run that will not
    // happen. A viewer and a blocked deployment were already refused above,
    // so neither reaches a reservation.
    const admission = admitLabRun({
      kind: 'lab-run',
      actorId: admin.adminId,
      actorRole: authz.role,
    });
    if (!admission.allowed) {
      auditPlatformAction({
        adminId: admin.adminId,
        role: authz.role,
        action: 'labs:run',
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
      action: 'labs:run',
      target: typeof fixtureId === 'string' && fixtureId.length > 0 ? fixtureId : 'upload',
    });

    if (typeof fixtureId === 'string' && fixtureId.length > 0) {
      const result = await runResumeLab(
        { source: 'fixture', fixtureId },
        { userId: admin.adminId }
      );
      settleCost(result, admission, { adminId: admin.adminId, role: authz.role });
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'parsed' ? 200 : 409,
      });
    }

    if (file instanceof File) {
      // Read once, in memory. Refused before that if it is obviously too big,
      // so a large upload is not buffered only to be rejected.
      if (file.size > MAX_UPLOAD_BYTES) {
        // Refused before the provider: nothing was spent.
        releaseLabRun(admission.reservationId);
        return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 413 });
      }

      const result = await runResumeLab(
        {
          source: 'upload',
          bytes: Buffer.from(await file.arrayBuffer()),
          // Used as a label only. Never joined to a path.
          filename: file.name,
          declaredType: file.type,
        },
        { userId: admin.adminId }
      );
      settleCost(result, admission, { adminId: admin.adminId, role: authz.role });
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'parsed' ? 200 : 409,
      });
    }

    releaseLabRun(admission.reservationId);
    return NextResponse.json({ error: 'Send either a fixtureId or a PDF file' }, { status: 400 });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/labs/resume-import-ai/run',
      method: 'POST',
    });
  }
}
