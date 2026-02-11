import { db } from '@/lib/db';
import { mediumImportService } from '@/services/import/medium.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/medium
 *
 * Import blog posts from Medium via RSS feed.
 *
 * Body:
 *   { "username": "@johndoe" }
 *   — or —
 *   { "feedUrl": "https://medium.com/feed/@johndoe" }
 *   — or —
 *   { "platform": "substack", "identifier": "example" }
 *
 * Optional:
 *   { "saveToProfile": true }  — persist to DB immediately
 *
 * Legal: RSS feeds are publicly published by the platform for
 * consumption. No scraping, no ToS violations.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { username, feedUrl, platform, identifier, saveToProfile } = body;

    // Determine which import path to use
    let result;

    if (username) {
      // Medium username import
      result = await mediumImportService.importFromMedium(username, userId);
    } else if (feedUrl) {
      // Generic RSS feed URL
      result = await mediumImportService.importFromRSS(feedUrl, userId, platform);
    } else if (platform && identifier) {
      // Known platform + identifier (e.g. { platform: "devto", identifier: "johndoe" })
      result = await mediumImportService.importFromPlatform(platform, identifier, userId);
    } else {
      return NextResponse.json(
        {
          error:
            'Provide one of: "username" (for Medium), "feedUrl" (any RSS), or "platform" + "identifier".',
        },
        { status: 400 }
      );
    }

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || 'Import failed' },
        { status: result.errorCode === 'FEED_NOT_FOUND' ? 404 : 400 }
      );
    }

    // Optionally save blog posts to profile
    if (saveToProfile && result.data.blogPosts?.length) {
      await saveBlogPostsToProfile(userId, result.data.blogPosts, result.data.links);
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      stats: {
        blogPosts: result.data.blogPosts?.length || 0,
        links: result.data.links?.length || 0,
      },
      message: `Found ${result.data.blogPosts?.length || 0} blog posts`,
    });
  } catch (error) {
    console.error('[Medium Import API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import blog posts' },
      { status: 500 }
    );
  }
}

/**
 * Persist blog posts and links to the user's profile
 */
async function saveBlogPostsToProfile(
  clerkId: string,
  blogPosts: NonNullable<
    typeof import('@/services/import/types').NormalizedImportResult.prototype.blogPosts
  >,
  links?: NonNullable<
    typeof import('@/services/import/types').NormalizedImportResult.prototype.links
  >
) {
  const user = await db.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (!user?.profile) return;

  const profileId = user.profile.id;

  // Upsert blog posts (dedup by URL)
  for (const post of blogPosts) {
    await db.blogPost.upsert({
      where: {
        profileId_url: { profileId, url: post.url },
      },
      create: {
        profileId,
        title: post.title,
        url: post.url,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        thumbnail: post.thumbnail,
        author: post.author,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        tags: post.tags || [],
        readTimeMin: post.readTimeMin,
        claps: post.claps,
        platform: post.platform,
        platformIcon: post.platformIcon,
        source: post.source,
      },
      update: {
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        thumbnail: post.thumbnail,
        tags: post.tags || [],
        readTimeMin: post.readTimeMin,
        claps: post.claps,
      },
    });
  }

  // Add blog link if not already present
  if (links?.length) {
    for (const link of links) {
      const exists = await db.link.findFirst({
        where: { profileId, url: link.url },
      });
      if (!exists) {
        const linkType = link.type as
          | 'GITHUB'
          | 'LINKEDIN'
          | 'TWITTER'
          | 'PORTFOLIO'
          | 'BLOG'
          | 'DRIBBBLE'
          | 'BEHANCE'
          | 'YOUTUBE'
          | 'MEDIUM'
          | 'SUBSTACK'
          | 'HASHNODE'
          | 'DEVTO'
          | 'OTHER';
        await db.link.create({
          data: {
            profileId,
            type: linkType,
            url: link.url,
            label: link.label,
            source: link.source,
          },
        });
      }
    }
  }

  // Update data source connection
  await db.dataSourceConnection.upsert({
    where: {
      profileId_source: { profileId, source: 'BLOG' },
    },
    create: {
      profileId,
      source: 'BLOG',
      status: 'CONNECTED',
      lastImportedAt: new Date(),
      itemsImported: blogPosts.length,
    },
    update: {
      status: 'CONNECTED',
      lastImportedAt: new Date(),
      itemsImported: blogPosts.length,
      importError: null,
    },
  });
}
