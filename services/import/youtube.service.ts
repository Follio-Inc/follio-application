/**
 * YouTube Import Service
 *
 * Fetches public video data from YouTube using the official
 * YouTube Data API v3.
 *
 * Legal basis:
 * - Uses the official Google/YouTube Data API v3
 * - API key is required (free tier: 10,000 quota units/day)
 * - Only reads public data the channel owner has published
 * - Complies with YouTube API Terms of Service
 *
 * Setup:
 * 1. Go to https://console.cloud.google.com
 * 2. Create a project → Enable "YouTube Data API v3"
 * 3. Create an API key (restrict to YouTube Data API)
 * 4. Set YOUTUBE_API_KEY in your .env
 *
 * Quota costs per request:
 * - search.list     = 100 units
 * - channels.list   = 1 unit
 * - videos.list     = 1 unit
 * - playlistItems   = 1 unit
 *
 * Strategy: We use channels.list + playlistItems.list (the "uploads"
 * playlist) which costs only ~2 units instead of search (100 units).
 */

import type {
  IYouTubeImportService,
  ImportServiceResult,
  NormalizedImportResult,
  NormalizedLink,
  NormalizedYouTubeVideo,
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_RESULTS = 50; // Max per page from YouTube API

// ─── YouTube API Response Types ────────────────────────────────

interface YouTubeChannelSnippet {
  title: string;
  description: string;
  customUrl?: string;
  thumbnails?: { default?: { url: string }; high?: { url: string } };
}

interface YouTubeChannelContentDetails {
  relatedPlaylists: { uploads: string };
}

interface YouTubeChannelStatistics {
  viewCount: string;
  subscriberCount: string;
  videoCount: string;
}

interface YouTubeChannelItem {
  id: string;
  snippet: YouTubeChannelSnippet;
  contentDetails: YouTubeChannelContentDetails;
  statistics: YouTubeChannelStatistics;
}

interface YouTubePlaylistItemSnippet {
  title: string;
  description: string;
  publishedAt: string;
  thumbnails?: { default?: { url: string }; high?: { url: string }; maxres?: { url: string } };
  resourceId: { videoId: string };
  channelId: string;
  channelTitle: string;
}

interface YouTubePlaylistItem {
  snippet: YouTubePlaylistItemSnippet;
}

interface YouTubeVideoContentDetails {
  duration: string; // ISO 8601 e.g. "PT5M30S"
}

interface YouTubeVideoStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    thumbnails?: { default?: { url: string }; high?: { url: string }; maxres?: { url: string } };
    tags?: string[];
  };
  contentDetails: YouTubeVideoContentDetails;
  statistics: YouTubeVideoStatistics;
}

// ─── Helpers ───────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error(
      'YOUTUBE_API_KEY environment variable is not set. ' +
        'Get one free at https://console.cloud.google.com → YouTube Data API v3.'
    );
  }
  return key;
}

/**
 * Parse a YouTube URL / handle / channel ID into a usable identifier.
 * Supports:
 *   - https://www.youtube.com/@handle
 *   - https://www.youtube.com/channel/UCxxxxxx
 *   - https://www.youtube.com/c/CustomName
 *   - https://www.youtube.com/user/Username
 *   - Raw channel ID:  UCxxxxxx
 *   - Handle: @handle
 */
function parseChannelInput(input: string): { type: 'id' | 'handle' | 'username'; value: string } {
  const trimmed = input.trim();

  // Direct channel ID
  if (trimmed.startsWith('UC') && trimmed.length >= 20 && !trimmed.includes('/')) {
    return { type: 'id', value: trimmed };
  }

  // @handle without URL
  if (trimmed.startsWith('@')) {
    return { type: 'handle', value: trimmed };
  }

  // Try parsing as URL
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const path = url.pathname.replace(/\/+$/, '');

    // /channel/UCxxxxxx
    const channelMatch = path.match(/\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { type: 'id', value: channelMatch[1] };

    // /@handle
    const handleMatch = path.match(/\/@([\w.-]+)/);
    if (handleMatch) return { type: 'handle', value: `@${handleMatch[1]}` };

    // /c/CustomName or /user/Username
    const legacyMatch = path.match(/\/(c|user)\/([\w.-]+)/);
    if (legacyMatch) return { type: 'username', value: legacyMatch[2] };

    // Fallback — treat whatever is after the first slash as a handle
    const fallback = path.replace(/^\//, '');
    if (fallback) return { type: 'handle', value: `@${fallback}` };
  } catch {
    // Not a URL — treat as handle
  }

  return { type: 'handle', value: trimmed.startsWith('@') ? trimmed : `@${trimmed}` };
}

/**
 * Parse a YouTube video URL into a video ID.
 * Supports youtube.com/watch?v=xxx, youtu.be/xxx, youtube.com/embed/xxx
 */
function parseVideoUrl(input: string): string | null {
  const trimmed = input.trim();

  // Direct video ID (11 chars)
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);

    // youtube.com/watch?v=xxx
    const vParam = url.searchParams.get('v');
    if (vParam) return vParam;

    // youtu.be/xxx
    if (url.hostname === 'youtu.be') {
      return url.pathname.replace(/^\//, '').split('/')[0] || null;
    }

    // youtube.com/embed/xxx or youtube.com/v/xxx
    const embedMatch = url.pathname.match(/\/(embed|v)\/([\w-]+)/);
    if (embedMatch) return embedMatch[2];

    // youtube.com/shorts/xxx
    const shortsMatch = url.pathname.match(/\/shorts\/([\w-]+)/);
    if (shortsMatch) return shortsMatch[1];
  } catch {
    // Not a URL
  }

  return null;
}

/**
 * Convert ISO 8601 duration to human-readable
 */
function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}:` : '';
  const m = match[2] || '0';
  const s = (match[3] || '0').padStart(2, '0');
  if (h) {
    return `${h}${m.padStart(2, '0')}:${s}`;
  }
  return `${m}:${s}`;
}

// ─── Service Implementation ────────────────────────────────────

export class YouTubeImportService implements IYouTubeImportService {
  /**
   * Import videos from a YouTube channel
   */
  async importFromYouTube(channelInput: string, _userId: string): Promise<ImportServiceResult> {
    try {
      const apiKey = getApiKey();
      const parsed = parseChannelInput(channelInput);

      // Step 1: Resolve channel ID
      const channel = await this.resolveChannel(parsed, apiKey);
      if (!channel) {
        return {
          success: false,
          error: 'YouTube channel not found. Check the URL or handle and try again.',
          errorCode: 'CHANNEL_NOT_FOUND',
        };
      }

      // Step 2: Get the "uploads" playlist ID
      const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

      // Step 3: Fetch videos from uploads playlist
      const playlistItems = await this.fetchPlaylistItems(uploadsPlaylistId, apiKey);

      if (playlistItems.length === 0) {
        return {
          success: false,
          error: 'No public videos found on this channel.',
          errorCode: 'NO_VIDEOS_FOUND',
        };
      }

      // Step 4: Get detailed video stats (batch up to 50 at a time)
      const videoIds = playlistItems.map((item) => item.snippet.resourceId.videoId);
      const videoDetails = await this.fetchVideoDetails(videoIds, apiKey);

      // Step 5: Normalize
      const videos = this.normalizeVideos(videoDetails);
      const link = this.buildChannelLink(channel);

      const result: NormalizedImportResult = {
        source: 'YOUTUBE',
        profile: {
          summary: channel.snippet.description || undefined,
        },
        links: link ? [link] : [],
        youtubeVideos: videos,
        blogPosts: [],
        experiences: [],
        projects: [],
        educations: [],
        skills: [],
        certifications: [],
        meta: {
          source: 'YOUTUBE',
          importedAt: new Date(),
          rawDataStored: false,
          confidence: 0.95,
        },
        summary: {
          youtubeVideos: videos.length,
          links: link ? 1 : 0,
          profileFields: 0,
          blogPosts: 0,
          experiences: 0,
          projects: 0,
          educations: 0,
          skills: 0,
          certifications: 0,
        },
      };

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof Error && error.message.includes('YOUTUBE_API_KEY')) {
        return { success: false, error: error.message, errorCode: 'API_KEY_MISSING' };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import from YouTube',
        errorCode: 'YOUTUBE_IMPORT_ERROR',
      };
    }
  }

  /**
   * Import a single YouTube video by URL
   */
  async importVideo(videoUrl: string, _userId: string): Promise<ImportServiceResult> {
    try {
      const apiKey = getApiKey();
      const videoId = parseVideoUrl(videoUrl);
      if (!videoId) {
        return {
          success: false,
          error: 'Invalid YouTube video URL.',
          errorCode: 'INVALID_VIDEO_URL',
        };
      }

      const details = await this.fetchVideoDetails([videoId], apiKey);
      if (details.length === 0) {
        return {
          success: false,
          error: 'Video not found or is private.',
          errorCode: 'VIDEO_NOT_FOUND',
        };
      }

      const videos = this.normalizeVideos(details);
      const result: NormalizedImportResult = {
        source: 'YOUTUBE',
        youtubeVideos: videos,
        blogPosts: [],
        experiences: [],
        projects: [],
        educations: [],
        skills: [],
        certifications: [],
        meta: {
          source: 'YOUTUBE',
          importedAt: new Date(),
          rawDataStored: false,
          confidence: 0.95,
        },
        summary: {
          youtubeVideos: videos.length,
          profileFields: 0,
          blogPosts: 0,
          experiences: 0,
          projects: 0,
          educations: 0,
          skills: 0,
          certifications: 0,
        },
      };

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import video',
        errorCode: 'YOUTUBE_IMPORT_ERROR',
      };
    }
  }

  /**
   * Refresh/re-import from a known channel ID
   */
  async refreshYouTube(channelId: string, userId: string): Promise<ImportServiceResult> {
    return this.importFromYouTube(channelId, userId);
  }

  // ─── Private API Helpers ──────────────────────────────────────

  private async resolveChannel(
    parsed: { type: 'id' | 'handle' | 'username'; value: string },
    apiKey: string
  ): Promise<YouTubeChannelItem | null> {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      key: apiKey,
    });

    if (parsed.type === 'id') {
      params.set('id', parsed.value);
    } else if (parsed.type === 'handle') {
      params.set('forHandle', parsed.value);
    } else {
      params.set('forUsername', parsed.value);
    }

    const res = await fetch(`${YOUTUBE_API_BASE}/channels?${params}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { items?: YouTubeChannelItem[] };
    return data.items?.[0] || null;
  }

  private async fetchPlaylistItems(
    playlistId: string,
    apiKey: string,
    maxItems = MAX_RESULTS
  ): Promise<YouTubePlaylistItem[]> {
    const all: YouTubePlaylistItem[] = [];
    let pageToken: string | undefined;

    while (all.length < maxItems) {
      const params = new URLSearchParams({
        part: 'snippet',
        playlistId,
        maxResults: String(Math.min(50, maxItems - all.length)),
        key: apiKey,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`);
      if (!res.ok) break;

      const data = (await res.json()) as {
        items?: YouTubePlaylistItem[];
        nextPageToken?: string;
      };

      if (data.items) all.push(...data.items);
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    return all;
  }

  private async fetchVideoDetails(videoIds: string[], apiKey: string): Promise<YouTubeVideoItem[]> {
    const all: YouTubeVideoItem[] = [];

    // YouTube API allows max 50 IDs per request
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: batch.join(','),
        key: apiKey,
      });

      const res = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
      if (!res.ok) continue;

      const data = (await res.json()) as { items?: YouTubeVideoItem[] };
      if (data.items) all.push(...data.items);
    }

    return all;
  }

  private normalizeVideos(items: YouTubeVideoItem[]): NormalizedYouTubeVideo[] {
    return items.map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      description: item.snippet.description ? item.snippet.description.slice(0, 500) : undefined,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      thumbnail:
        item.snippet.thumbnails?.maxres?.url ||
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.default?.url,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: formatDuration(item.contentDetails.duration),
      viewCount: item.statistics.viewCount ? parseInt(item.statistics.viewCount, 10) : undefined,
      likeCount: item.statistics.likeCount ? parseInt(item.statistics.likeCount, 10) : undefined,
      commentCount: item.statistics.commentCount
        ? parseInt(item.statistics.commentCount, 10)
        : undefined,
      tags: item.snippet.tags?.slice(0, 10) || [],
      source: 'YOUTUBE' as const,
    }));
  }

  private buildChannelLink(channel: YouTubeChannelItem): NormalizedLink | null {
    const handle = channel.snippet.customUrl;
    const url = handle
      ? `https://www.youtube.com/${handle}`
      : `https://www.youtube.com/channel/${channel.id}`;

    return {
      type: 'YOUTUBE',
      url,
      label: channel.snippet.title || 'YouTube Channel',
      source: 'YOUTUBE' as const,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────

export const youtubeImportService = new YouTubeImportService();
