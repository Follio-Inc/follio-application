import { db } from '@/lib/db';
import type { NormalizedLink, NormalizedYouTubeVideo } from '@/services/import/types';
import { youtubeImportService } from '@/services/import/youtube.service';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/import/youtube
 *
 * Import videos from YouTube using the official YouTube Data API v3.
 *
 * Body (channel import):
 *   { "channel": "https://www.youtube.com/@username" }
 *   { "channel": "@username" }
 *   { "channel": "UCxxxxxxxx" }
 *
 * Body (single video):
 *   { "videoUrl": "https://www.youtube.com/watch?v=xxxxx" }
 *
 * Optional:
 *   { "saveToProfile": true }  — persist to DB immediately
 *
 * Legal: Uses official YouTube Data API v3 with API key.
 * Requires YOUTUBE_API_KEY env variable.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { channel, videoUrl, saveToProfile } = body;

    let result;

    if (channel) {
      // Import from channel
      result = await youtubeImportService.importFromYouTube(channel, userId);
    } else if (videoUrl) {
      // Import single video
      result = await youtubeImportService.importVideo(videoUrl, userId);
    } else {
      return NextResponse.json(
        { error: 'Provide either "channel" (URL, @handle, or ID) or "videoUrl".' },
        { status: 400 }
      );
    }

    if (!result.success || !result.data) {
      const status =
        result.errorCode === 'CHANNEL_NOT_FOUND' || result.errorCode === 'VIDEO_NOT_FOUND'
          ? 404
          : result.errorCode === 'API_KEY_MISSING'
            ? 503
            : 400;

      return NextResponse.json({ error: result.error || 'Import failed' }, { status });
    }

    // Optionally save to profile
    if (saveToProfile && result.data.youtubeVideos?.length) {
      await saveYouTubeToProfile(userId, result.data.youtubeVideos, result.data.links);
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      stats: {
        videos: result.data.youtubeVideos?.length || 0,
        links: result.data.links?.length || 0,
        totalViews: result.data.youtubeVideos?.reduce((sum, v) => sum + (v.viewCount || 0), 0) || 0,
      },
      message: `Found ${result.data.youtubeVideos?.length || 0} videos`,
    });
  } catch (error) {
    console.error('[YouTube Import API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import from YouTube' },
      { status: 500 }
    );
  }
}

/**
 * Persist YouTube videos and channel link to the user's profile
 */
async function saveYouTubeToProfile(
  clerkId: string,
  videos: NormalizedYouTubeVideo[],
  links?: NormalizedLink[]
) {
  const user = await db.user.findUnique({
    where: { clerkId },
    include: { profile: true },
  });

  if (!user?.profile) return;

  const profileId = user.profile.id;

  // Upsert videos (dedup by videoId)
  for (const video of videos) {
    await db.youTubeVideo.upsert({
      where: {
        profileId_videoId: { profileId, videoId: video.videoId },
      },
      create: {
        profileId,
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        url: video.url,
        thumbnail: video.thumbnail,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
        duration: video.duration,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        tags: video.tags || [],
        source: 'YOUTUBE',
      },
      update: {
        title: video.title,
        description: video.description,
        thumbnail: video.thumbnail,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        duration: video.duration,
      },
    });
  }

  // Add YouTube channel link if not already present
  if (links?.length) {
    for (const link of links) {
      const exists = await db.link.findFirst({
        where: { profileId, url: link.url },
      });
      if (!exists) {
        await db.link.create({
          data: {
            profileId,
            type: 'YOUTUBE',
            url: link.url,
            label: link.label,
            source: 'YOUTUBE',
          },
        });
      }
    }
  }

  // Update data source connection
  await db.dataSourceConnection.upsert({
    where: {
      profileId_source: { profileId, source: 'YOUTUBE' },
    },
    create: {
      profileId,
      source: 'YOUTUBE',
      status: 'CONNECTED',
      lastImportedAt: new Date(),
      itemsImported: videos.length,
      metadata: {
        channelId: videos[0]?.channelId,
        channelTitle: videos[0]?.channelTitle,
      },
    },
    update: {
      status: 'CONNECTED',
      lastImportedAt: new Date(),
      itemsImported: videos.length,
      importError: null,
      metadata: {
        channelId: videos[0]?.channelId,
        channelTitle: videos[0]?.channelTitle,
      },
    },
  });
}
