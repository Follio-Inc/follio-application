import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { resolveArtifactRequest } from '@/_admin-panel/platform/tests';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Content types for what Playwright retains. Anything else downloads. */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/**
 * Serves one Live QA artifact — a screenshot or a trace (PLATFORM_TODO item 14).
 *
 * Admin and local-only, like every other runner surface. The path is resolved
 * by `resolveArtifactRequest`, which joins it to the Live QA root, resolves it
 * (collapsing any `..`), requires the result to sit inside `.artifacts`, and
 * checks the real path in case of a symlink. Anything else is a 400: this
 * route serves artifacts or nothing.
 *
 * Read-only. It never deletes, so the failure screenshots and traces the
 * existing runner retains stay where they are.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const requested = new URL(request.url).searchParams.get('path') ?? '';
    const resolved = resolveArtifactRequest(requested);

    if (resolved === null) {
      return NextResponse.json({ error: 'Artifact not available' }, { status: 400 });
    }

    const extension = resolved.slice(resolved.lastIndexOf('.')).toLowerCase();

    return new NextResponse(new Uint8Array(readFileSync(resolved)), {
      headers: {
        'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
        // Basename only, with anything that could break out of the quoting
        // stripped. The path is already contained; this guards the header.
        'Content-Disposition': `inline; filename="${path.basename(resolved).replace(/["\r\n]/g, '')}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/platform/tests/live-qa/artifact',
      method: 'GET',
    });
  }
}
