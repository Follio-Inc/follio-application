'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';

import { ShareDialog } from './share-dialog';

import type { FullProfile, PublicProfile } from '@/types';

interface ResumePreviewPanelProps {
  profile: FullProfile;
}

export function ResumePreviewPanel({ profile: initialProfile }: ResumePreviewPanelProps) {
  const [profile, setProfile] = useState<FullProfile>(initialProfile);
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

  // Auto-refresh: fetch latest profile data whenever section editors dispatch a save event
  const refreshProfile = useCallback(async () => {
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
      <div className="flex h-11 items-center justify-between px-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Resume Preview
        </span>
        <ShareDialog profile={profile} />
      </div>

      {/* Scaled Resume Content */}
      <div ref={containerRef} className="flex-1 overflow-auto rounded-b-xl bg-muted/30 p-6">
        <div
          className="rounded-lg bg-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10"
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
