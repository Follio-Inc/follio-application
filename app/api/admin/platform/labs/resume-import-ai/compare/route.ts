import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
// Imported from the module rather than the lab's barrel: the openresume
// parser cannot be bundled by Turbopack (see the barrel's note), and routing
// it through the barrel would break the lab page and the single-run route
// too. This endpoint is the only thing that needs it.
import { runResumeComparison } from '@/_admin-panel/platform/labs/resume-import-ai/compare-runner';
import { MAX_UPLOAD_BYTES } from '@/_admin-panel/platform/labs/resume-import-ai/runner';
import { observeComparison, recordObservations } from '@/_admin-panel/platform/perf';
import type { ResumeComparisonResult } from '@/_admin-panel/platform/labs/resume-import-ai';
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

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertCanRunDeveloperSuites();

    const form = await request.formData().catch(() => null);
    if (form === null) {
      return NextResponse.json({ error: 'Expected a multipart form' }, { status: 400 });
    }

    const fixtureId = form.get('fixtureId');
    const file = form.get('file');

    if (typeof fixtureId === 'string' && fixtureId.length > 0) {
      const result = await runResumeComparison(
        { source: 'fixture', fixtureId },
        { userId: admin.adminId }
      );
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'compared' ? 200 : 409,
      });
    }

    if (file instanceof File) {
      if (file.size > MAX_UPLOAD_BYTES) {
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
      return NextResponse.json(withPerf(result), {
        status: result.outcome === 'compared' ? 200 : 409,
      });
    }

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
