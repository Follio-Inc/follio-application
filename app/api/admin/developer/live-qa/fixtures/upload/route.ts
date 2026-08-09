import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { saveUploadedResume } from '@/_admin-panel/modules/developer/live-qa';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF fixtures are supported' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'PDF too large (max 8MB)' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const fixture = saveUploadedResume(file.name, bytes);
    return NextResponse.json(fixture);
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, {
      path: '/api/admin/developer/live-qa/fixtures/upload',
      method: 'POST',
    });
  }
}
