import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { importLinkedInProfileByUrl } from '@/services/import/linkedin-profile-url.service';

/**
 * POST /api/import/linkedin/profile
 *
 * Import a LinkedIn profile from a pasted URL or vanity username.
 * Uses LinkedIn's Partner vanityName API when LINKEDIN_API_ACCESS_TOKEN is set;
 * otherwise saves the canonical profile link only (no HTML scraping).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const input =
      typeof body?.url === 'string'
        ? body.url
        : typeof body?.username === 'string'
          ? body.username
          : '';

    if (!input.trim()) {
      return NextResponse.json(
        { error: 'LinkedIn profile URL or username is required' },
        { status: 400 }
      );
    }

    const result = await importLinkedInProfileByUrl(input);

    return NextResponse.json({
      success: true,
      data: {
        profile: result.profile,
        links: result.links,
        summary: {
          hasName: !!(result.fromLinkedIn.firstName || result.fromLinkedIn.lastName),
          hasProfilePicture: !!result.fromLinkedIn.avatarUrl,
          hasLinkedInUrl: true,
          total:
            (result.fromLinkedIn.firstName || result.fromLinkedIn.lastName ? 1 : 0) +
            (result.fromLinkedIn.avatarUrl ? 1 : 0) +
            (result.fromLinkedIn.headline ? 1 : 0) +
            1,
        },
        fromLinkedIn: result.fromLinkedIn,
        fetchedFromApi: result.fetchedFromApi,
      },
      message: result.message,
    });
  } catch (error) {
    console.error('[LinkedIn profile URL import] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to import LinkedIn profile';
    const status = message.toLowerCase().includes('enter a linkedin') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
