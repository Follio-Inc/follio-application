import { NextResponse } from 'next/server';

import { collectHealthReport } from '@/_admin-panel/modules/developer/health';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const report = await collectHealthReport();
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/developer/health', method: 'GET' });
  }
}
