import { NextRequest, NextResponse } from 'next/server';

import { toJSONResume } from '@/services/export.service';
import { getProfileByHandle } from '@/services/profile.service';

/**
 * GET /api/export/[handle]/json
 * Export profile as JSON Resume format
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

    // Only allow export of public profiles (or owner's own profile)
    if (profile.status !== 'PUBLIC') {
      return NextResponse.json({ error: 'Profile is not public' }, { status: 403 });
    }

    // Resume exports respect resume-specific visibility
    if (profile.resumeVisibility === 'UNLISTED') {
      return NextResponse.json({ error: 'Resume is unlisted' }, { status: 403 });
    }

    const jsonResume = toJSONResume(profile);

    return NextResponse.json(jsonResume, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${handle}-resume.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting JSON:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
