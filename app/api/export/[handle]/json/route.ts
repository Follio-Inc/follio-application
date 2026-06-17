import { NextRequest, NextResponse } from 'next/server';

import { toJSONResume } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

import { assertResumeExportAccess, contentDispositionAttachment } from '../access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export/[handle]/json
 * Export profile as JSON Resume format.
 *
 * The profile owner may always export, regardless of visibility settings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const profile = await getProfileByHandle(handle);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const access = await assertResumeExportAccess(request, handle, profile);
    if (!access.allowed) {
      return access.response;
    }

    const jsonResume = toJSONResume(profile);

    return NextResponse.json(jsonResume, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': contentDispositionAttachment(`${handle}-resume.json`),
      },
    });
  } catch (error) {
    console.error('Error exporting JSON:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
