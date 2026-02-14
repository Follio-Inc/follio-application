import { NextRequest, NextResponse } from 'next/server';

import { toPlainText } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

/**
 * GET /api/export/[handle]/text
 * Export profile as plain text
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

    if (profile.status !== 'PUBLIC') {
      return NextResponse.json({ error: 'Profile is not public' }, { status: 403 });
    }

    // Resume exports respect resume-specific visibility
    if (profile.resumeVisibility === 'UNLISTED') {
      return NextResponse.json({ error: 'Resume is unlisted' }, { status: 403 });
    }

    const plainText = toPlainText(profile);

    return new NextResponse(plainText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${handle}-resume.txt"`,
      },
    });
  } catch (error) {
    console.error('Error exporting text:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
