import { db } from '@/lib/db';
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
    const { links, saveToProfile } = body;

    if (!links || !Array.isArray(links)) {
      return NextResponse.json({ error: 'Links array is required' }, { status: 400 });
    }

    // Use the links import service
    const result = await linksImportService.importLinks(links, userId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Optionally save to profile
    if (saveToProfile && result.data?.links) {
      try {
        const user = await db.user.findUnique({
          where: { clerkId: userId },
          include: { profile: true },
        });

        if (user?.profile) {
          const profileId = user.profile.id;

          // Get existing links to avoid duplicates
          const existingLinks = await db.link.findMany({
            where: { profileId },
            select: { url: true },
          });
          const existingUrls = new Set(existingLinks.map((l) => l.url.toLowerCase()));

          // Add new links
          for (const link of result.data.links) {
            if (!existingUrls.has(link.url.toLowerCase())) {
              // Map link type to valid LinkType enum
              const upperType = link.type?.toUpperCase() || 'OTHER';
              let linkType: 'GITHUB' | 'LINKEDIN' | 'TWITTER' | 'PORTFOLIO' | 'BLOG' | 'OTHER' =
                'OTHER';
              if (upperType === 'GITHUB') linkType = 'GITHUB';
              else if (upperType === 'LINKEDIN') linkType = 'LINKEDIN';
              else if (upperType === 'TWITTER') linkType = 'TWITTER';
              else if (upperType === 'WEBSITE' || upperType === 'PORTFOLIO') linkType = 'PORTFOLIO';
              else if (upperType === 'BLOG') linkType = 'BLOG';

              await db.link.create({
                data: {
                  profileId,
                  type: linkType,
                  url: link.url,
                  label: link.label,
                  source: 'MANUAL',
                },
              });
              existingUrls.add(link.url.toLowerCase());
            }
          }

          console.log('[Links Import] Saved to profile:', profileId);
        }
      } catch (saveError) {
        console.error('[Links Import] Failed to save to profile:', saveError);
        // Don't fail the whole request
      }
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
