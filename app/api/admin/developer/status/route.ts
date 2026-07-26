import { NextResponse } from 'next/server';

import { collectDevtoolsStatus } from '@/_admin-panel/modules/developer/status';
import { requireAdmin } from '@/lib/admin';
import { handleApiError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireAdmin();
    let pathnameHint: string | null = null;
    try {
      const body = (await request.json()) as { pathname?: unknown };
      if (typeof body.pathname === 'string') pathnameHint = body.pathname.slice(0, 200);
    } catch {
      // empty body is fine
    }
    return NextResponse.json(collectDevtoolsStatus(pathnameHint));
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/developer/status', method: 'POST' });
  }
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(collectDevtoolsStatus(null));
  } catch (error) {
    return handleApiError(error, { path: '/api/admin/developer/status', method: 'GET' });
  }
}
