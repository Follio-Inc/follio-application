/**
 * GET /api/profile/[handle]/snap-view
 *
 * Generates snap view data for a public profile.
 * Returns AI-generated data when available, algorithmic fallback otherwise.
 *
 * Public endpoint — no auth required (same as viewing the profile).
 * Respects profile visibility settings.
 */

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { getPublicProfile } from '@/services/profile.service';
import { generateSnapViewData } from '@/services/snap-view.service';

const routeLogger = logger.child({ source: 'api-snap-view' });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;

    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
    }

    const profile = await getPublicProfile(handle);

    if (!profile || profile.status === 'DRAFT') {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const snapData = await generateSnapViewData(profile);

    return NextResponse.json(snapData, {
      headers: {
        // Cache for 5 minutes on CDN, serve stale for 1 hour while revalidating
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    routeLogger.error('Snap view generation failed', error);
    return NextResponse.json({ error: 'Failed to generate snap view' }, { status: 500 });
  }
}
