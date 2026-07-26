import { NextResponse } from 'next/server';

import { getQuickLinks } from '@/_admin-panel/modules/developer/links';
import { getSmokeItems } from '@/_admin-panel/modules/developer/smoke';
import { TEST_SUITES } from '@/_admin-panel/modules/developer/suites-catalog';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({
      suites: TEST_SUITES,
      smoke: getSmokeItems(),
      links: getQuickLinks(),
    });
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/developer/catalog', method: 'GET' });
  }
}
