import { NextRequest, NextResponse } from 'next/server';

import { generateResumePDF } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

/**
 * GET /api/export/[handle]/pdf
 * Export profile as a downloadable PDF resume
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

    const pdfBuffer = await generateResumePDF(profile);
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${handle}-resume.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
