'use client';

import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import type { BlogPost } from '@prisma/client';
import type { SourceDefinition } from './source-types';

interface MediumSourcePanelProps {
  source: SourceDefinition;
  blogPosts: BlogPost[];
  onRemoveSourceAction: (key: string) => void;
  onRefreshAction: () => void;
}

/**
 * Medium / Blog Data Source Panel
 *
 * Shows imported blog posts with title, excerpt, tags, read time,
 * and controls to refresh, toggle visibility, or remove.
 */
export function MediumSourcePanel({
  source,
  blogPosts,
  onRemoveSourceAction,
  onRefreshAction,
}: MediumSourcePanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Determine platform display
  const platform = blogPosts[0]?.platform || source.key;
  const platformLabel = source.label || platform.charAt(0).toUpperCase() + platform.slice(1);

  // Refresh: re-fetch from RSS using the stored fetch info
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);
    setRefreshError(null);

    try {
      // Use stored fetch info if available (preferred)
      let endpoint = '/api/import/medium';
      let body: Record<string, unknown> = { saveToProfile: true };

      if (source.fetchInfo) {
        endpoint = source.fetchInfo.endpoint;
        body = { ...source.fetchInfo.body, saveToProfile: true };
      } else {
        // Fallback: try to infer from existing blog posts
        const firstPost = blogPosts[0];
        if (firstPost?.author && source.key === 'medium') {
          body.username = firstPost.author;
        } else if (source.key !== 'medium' && source.key) {
          body.platform = source.key;
          // Try to infer identifier from an existing post URL
          if (firstPost?.url) {
            try {
              const url = new URL(firstPost.url);
              const pathParts = url.pathname.split('/').filter(Boolean);
              if (pathParts.length > 0) body.identifier = pathParts[0];
            } catch {
              /* ignore */
            }
          }
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');

      setRefreshMessage(`Refreshed: ${data.stats?.blogPosts || 0} posts found`);
      onRefreshAction();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  }, [blogPosts, source, onRefreshAction]);

  // Toggle post visibility
  const handleToggleVisibility = useCallback(
    async (postId: string, currentlyVisible: boolean) => {
      setTogglingId(postId);
      try {
        const res = await fetch(`/api/import/medium/${postId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isVisible: !currentlyVisible }),
        });
        if (!res.ok) throw new Error('Failed to update');
        onRefreshAction();
      } catch (err) {
        console.error('Toggle visibility error:', err);
      } finally {
        setTogglingId(null);
      }
    },
    [onRefreshAction]
  );

  // Remove this source entirely
  const handleRemove = useCallback(async () => {
    setIsRemoving(true);
    try {
      // Delete all blog posts for this platform
      await fetch(`/api/import/medium/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: source.key }),
      });
      onRemoveSourceAction(source.key);
    } catch (err) {
      console.error('Remove source error:', err);
    } finally {
      setIsRemoving(false);
    }
  }, [source.key, onRemoveSourceAction]);

  // Format date
  const formatDate = (date: string | Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Hidden count for status display
  const hiddenPosts = blogPosts.filter((p) => !p.isVisible);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className={`h-5 w-5 ${source.iconColorClass}`} />
                {platformLabel}
              </CardTitle>
              <CardDescription>
                {blogPosts.length} article{blogPosts.length !== 1 ? 's' : ''} imported
                {hiddenPosts.length > 0 && ` (${hiddenPosts.length} hidden)`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="gap-1.5"
              >
                {isRefreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={handleRemove}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-4 w-4" />
                )}
                Remove
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Status messages */}
        {refreshMessage && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {refreshMessage}
            </div>
          </CardContent>
        )}
        {refreshError && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {refreshError}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Blog Posts List */}
      {blogPosts.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No posts imported yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click Refresh to fetch your latest posts
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {blogPosts.map((post) => (
            <Card
              key={post.id}
              className={`transition-opacity ${!post.isVisible ? 'opacity-50' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* Thumbnail (skip tracking pixels and non-image URLs) */}
                  {post.thumbnail &&
                    !post.thumbnail.includes('/stat?') &&
                    !post.thumbnail.includes('tracking') &&
                    /\.(jpe?g|png|gif|webp|avif|svg)/i.test(post.thumbnail) && (
                      <div className="relative hidden h-20 w-28 shrink-0 overflow-hidden rounded-md sm:block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post.thumbnail}
                          alt={post.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Title */}
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-1.5 font-medium leading-snug hover:text-primary"
                      >
                        <span className="line-clamp-1">{post.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>

                      {/* Visibility toggle */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleToggleVisibility(post.id, post.isVisible)}
                        disabled={togglingId === post.id}
                        title={post.isVisible ? 'Hide from profile' : 'Show on profile'}
                      >
                        {togglingId === post.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : post.isVisible ? (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>

                    {/* Excerpt */}
                    {post.excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {post.excerpt}
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {post.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(post.publishedAt)}
                        </span>
                      )}
                      {post.readTimeMin && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {post.readTimeMin} min read
                        </span>
                      )}
                      {post.claps != null && post.claps > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          {post.claps.toLocaleString()} claps
                        </span>
                      )}
                      {post.isFeatured && (
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          Featured
                        </Badge>
                      )}
                    </div>

                    {/* Tags */}
                    {post.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {post.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag}
                          </span>
                        ))}
                        {post.tags.length > 5 && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            +{post.tags.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
