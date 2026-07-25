'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import {
  buildDesignForTemplateSwitch,
  getTemplateDefaultShowPhoto,
  type ResumeTemplateId,
} from '@/lib/resume/templates';
import { cn } from '@/lib/utils';
import type { PublicProfile, ResumeDesign } from '@/types';

/** Natural width of the resume paper (US Letter at 96dpi). */
const RESUME_CONTENT_WIDTH = 816;

/** Assumed first-page height for aspect-ratio thumbnails. */
const RESUME_CONTENT_HEIGHT = 1056;

interface ResumeTemplateLiveThumbnailProps {
  /** Live builder draft — thumbnails always reflect this user's content. */
  profile: PublicProfile;
  /** Template to preview (design defaults applied via switch helper). */
  templateId: ResumeTemplateId;
  /** Current design before applying the template switch. */
  currentDesign: ResumeDesign;
  className?: string;
  /** Override aspect ratio (width / height). Defaults to US Letter. */
  aspectRatio?: number;
}

/**
 * Miniature, non-interactive resume preview for a specific template.
 * Renders whatever profile the parent passes (builder: live draft;
 * onboarding gallery may pass a sample when the draft is sparse).
 */
export function ResumeTemplateLiveThumbnail({
  profile,
  templateId,
  currentDesign,
  className,
  aspectRatio = RESUME_CONTENT_WIDTH / RESUME_CONTENT_HEIGHT,
}: ResumeTemplateLiveThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const previewProfile = useMemo(() => {
    const nextDesign = buildDesignForTemplateSwitch(currentDesign, templateId);
    return {
      ...profile,
      resumeDesign: nextDesign,
      // Preview the template’s default photo policy so cards match Restore Defaults.
      resumeShowPhoto: getTemplateDefaultShowPhoto(templateId),
    } as PublicProfile;
  }, [profile, currentDesign, templateId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / RESUME_CONTENT_WIDTH);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden bg-white shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]',
        className
      )}
      style={{ aspectRatio: `${aspectRatio}` }}
      aria-hidden
    >
      {scale > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left select-none [&_.resume-actions]:hidden [&_.resume-paper-wrapper]:shadow-none"
          style={{
            width: RESUME_CONTENT_WIDTH,
            transform: `scale(${scale})`,
          }}
        >
          <CleanResumeView profile={previewProfile} />
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-muted/40" />
      )}
    </div>
  );
}
