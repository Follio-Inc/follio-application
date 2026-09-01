import { NextResponse } from 'next/server';

import { buildResumeReaderCatalog, runResumeReader } from '@/_admin-panel/modules/developer/ai';
import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(buildResumeReaderCatalog());
  } catch (error) {
    return handleApiError(error, {
      path: '/api/admin/developer/ai/resume-reader',
      method: 'GET',
    });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    assertCanRunDeveloperSuites();

    const form = await request.formData();
    const fixtureIdRaw = form.get('fixtureId');
    const fixtureId =
      typeof fixtureIdRaw === 'string' && fixtureIdRaw.trim() ? fixtureIdRaw.trim() : undefined;
    const file = form.get('file');

    const uploaded =
      file instanceof File
        ? {
            name: file.name,
            type: file.type,
            size: file.size,
            buffer: Buffer.from(await file.arrayBuffer()),
          }
        : undefined;

    const result = await runResumeReader({
      userId: admin.clerkId,
      file: uploaded,
      fixtureId: uploaded ? undefined : fixtureId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/developer/ai/resume-reader',
      method: 'POST',
    });
  }
}
