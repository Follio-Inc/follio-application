import { NextRequest, NextResponse } from 'next/server';

import { toPlainText } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

import { assertResumeExportAccess, contentDispositionAttachment } from '../access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export/[handle]/text
 * Export profile as plain text.
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

    const plainText = toPlainText(profile);

    return new NextResponse(plainText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': contentDispositionAttachment(`${handle}-resume.txt`),
      },
    });
  } catch (error) {
    console.error('Error exporting text:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
