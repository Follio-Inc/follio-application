import { NextResponse } from 'next/server';

import {
  assertCanRunDeveloperSuites,
  DeveloperSuitesDisabledError,
} from '@/_admin-panel/modules/developer/guard';
import { getTestSuite } from '@/_admin-panel/modules/developer/suites-catalog';
import { runTestSuite } from '@/_admin-panel/modules/developer/suites';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type TestBody = {
  suiteId?: unknown;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
    assertCanRunDeveloperSuites();

    const body = (await request.json()) as TestBody;
    const suiteId = typeof body.suiteId === 'string' ? body.suiteId : '';
    if (!suiteId || !getTestSuite(suiteId)) {
      return NextResponse.json({ error: 'Unknown suiteId' }, { status: 400 });
    }
    const result = await runTestSuite(suiteId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DeveloperSuitesDisabledError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return handleApiError(error, { path: '/api/admin/developer/test', method: 'POST' });
  }
}
