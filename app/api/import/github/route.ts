import { extractGitHubUsername, isValidGitHubUsername } from '@/lib/import/profile-url';
import { getEnhancedGitHubData } from '@/services/github-enhanced.service';
import { saveEnhancedGitHubToProfile } from '@/services/import/github-enhanced.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/github
 *
 * Import enhanced GitHub data including:
 * - Pinned repositories (featured projects)
 * - README content for project descriptions
 * - Organization memberships
 * - Language statistics (percentage-based)
 * - Repository topics as skills
 *
 * Accepts a bare username, @username, or full github.com profile URL.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accessToken, saveToProfile } = body;
    const rawUsername = typeof body.username === 'string' ? body.username : '';

    if (!rawUsername.trim()) {
      return NextResponse.json({ error: 'GitHub username is required' }, { status: 400 });
    }

    const username = extractGitHubUsername(rawUsername);

    if (!isValidGitHubUsername(username)) {
      return NextResponse.json({ error: 'Invalid GitHub username format' }, { status: 400 });
    }

    // Use enhanced GitHub data fetching
    const data = await getEnhancedGitHubData(username, accessToken);

    // Optionally save to profile
    if (saveToProfile) {
      const saveResult = await saveEnhancedGitHubToProfile(userId, data);
      if (!saveResult.success) {
        console.error('[GitHub Import API] Failed to save to profile:', saveResult.error);
      }
    }

    // Calculate stats for response
    const pinnedCount = data.projects.filter((p) => p.ghPinned).length;
    const languageCount = Object.keys(data.githubProfile.languageStats).length;
    const orgCount = data.githubProfile.organizations.length;

    return NextResponse.json({
      success: true,
      data,
      stats: {
        projects: data.projects.length,
        pinnedProjects: pinnedCount,
        skills: data.skills.length,
        languages: languageCount,
        organizations: orgCount,
        totalStars: data.githubProfile.totalStars,
        totalForks: data.githubProfile.totalForks,
      },
      message: `Imported ${data.projects.length} projects (${pinnedCount} pinned), ${data.skills.length} skills, and ${languageCount} languages from GitHub`,
    });
  } catch (error) {
    console.error('GitHub import error:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'GitHub user not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import from GitHub' },
      { status: 500 }
    );
  }
}
