import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { normalizeGitHubData } from '@/services/github.service';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, accessToken } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'GitHub username is required' },
        { status: 400 }
      );
    }

    // Validate username format
    if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
      return NextResponse.json(
        { error: 'Invalid GitHub username format' },
        { status: 400 }
      );
    }

    const data = await normalizeGitHubData(username, accessToken);

    return NextResponse.json({
      success: true,
      data,
      message: `Imported ${data.projects.length} projects and ${data.skills.length} skills from GitHub`,
    });
  } catch (error) {
    console.error('GitHub import error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'GitHub user not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import from GitHub' },
      { status: 500 }
    );
  }
}
