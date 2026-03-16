'use client';

import { useEffect, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';

import { useBuilderStore } from './builder-store-provider';

import type { PublicProfile } from '@/types';

/**
 * ResumePreviewPanel
 *
 * Reads from the builder zustand store so the preview updates in real-time
 * as the user edits fields — no API round-trip needed.
 */
export function ResumePreviewPanel() {
  const profile = useBuilderStore((s) => s.draftProfile);
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

  return (
    <div className="relative flex h-full flex-col">
      {/* Scaled Resume Content */}
      <div ref={containerRef} className="flex-1 overflow-auto px-6 pb-6 pt-6">
        <div
          className="overflow-hidden"
          style={{
            zoom: scale,
          }}
        >
          {/* Hide ResumeActions (print/copy buttons) in preview mode */}
          <div className="pt-4 [&>.resume-actions]:hidden">
            <CleanResumeView profile={profile as unknown as PublicProfile} />
          </div>
        </div>
      </div>
    </div>
  );
}
