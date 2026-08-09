import { NextResponse } from 'next/server';

import { buildLiveQaCatalog } from '@/_admin-panel/modules/developer/live-qa';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(buildLiveQaCatalog());
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/developer/live-qa/catalog', method: 'GET' });
  }
}
