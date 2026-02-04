import { enhancedGitHubImportService } from '@/services/import/github-enhanced.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/github/sync
 *
 * Refresh/sync GitHub data for the connected account.
 * This re-fetches all data from GitHub and updates the profile.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, accessToken } = body;

    if (!username) {
      return NextResponse.json({ error: 'GitHub username is required' }, { status: 400 });
    }

    // Validate username format
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
      return NextResponse.json({ error: 'Invalid GitHub username format' }, { status: 400 });
    }

    // Use the enhanced import service for sync
    const result = await enhancedGitHubImportService.refreshGitHub(username, accessToken, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to sync GitHub data' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      jobId: result.jobId,
      message: 'GitHub data synced successfully',
    });
  } catch (error) {
    console.error('GitHub sync error:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync GitHub data' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/import/github/sync
 *
 * Get the sync status for the user's GitHub connection.
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await enhancedGitHubImportService.getSyncStatus(userId);

    return NextResponse.json(status);
  } catch (error) {
    console.error('GitHub sync status error:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get sync status' },
      { status: 500 }
    );
  }
}
