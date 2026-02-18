'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { FullProfile, PublicProfile } from '@/types';

interface ResumePreviewPanelProps {
  profile: FullProfile;
}

export function ResumePreviewPanel({ profile: initialProfile }: ResumePreviewPanelProps) {
  const [profile, setProfile] = useState<FullProfile>(initialProfile);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // Calculate scale based on container width
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - 48; // 24px padding each side
      const newScale = Math.min(containerWidth / 816, 1);
      setScale(newScale);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const refreshProfile = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/profile?full=true&t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (e) {
      console.error('Failed to refresh preview:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Listen for profile update events (dispatched by section editors after saves)
  useEffect(() => {
    const handler = () => refreshProfile();
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, [refreshProfile]);

  // Update when initialProfile changes (e.g., on section navigation)
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  return (
    <div className="flex h-full flex-col">
      {/* Preview Header */}
      <div className="flex items-center justify-between border-b bg-background px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Resume Preview
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshProfile}
          disabled={isRefreshing}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Scaled Resume Content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted/50 p-6">
        <div
          className="rounded-sm bg-white shadow-md dark:bg-zinc-950"
          style={{
            zoom: scale,
          }}
        >
          {/* Hide ResumeActions (print/copy buttons) in preview mode */}
          <div className="[&>.resume-actions]:hidden">
            <CleanResumeView profile={profile as unknown as PublicProfile} />
          </div>
        </div>
      </div>
    </div>
  );
}
