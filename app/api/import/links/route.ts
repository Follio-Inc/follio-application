import { linksImportService } from '@/services/import';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/import/links
 * Validate and normalize manually added links
 */
export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { links } = body;

    if (!links || !Array.isArray(links)) {
      return NextResponse.json({ error: 'Links array is required' }, { status: 400 });
    }

    // Use the links import service
    const result = await linksImportService.importLinks(links, userId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: `Processed ${result.data?.summary?.links || 0} links`,
    });
  } catch (error) {
    console.error('Links import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process links' },
      { status: 500 }
    );
  }
}
