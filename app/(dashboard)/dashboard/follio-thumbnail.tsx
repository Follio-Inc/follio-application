'use client';

import Link from 'next/link';

import { DocumentThumbnail } from '@/components/document-preview/document-thumbnail';
import { LETTER_PAGE_HEIGHT_PX, LETTER_PAGE_WIDTH_PX } from '@/lib/document-design';
import { getFollioPreviewPath } from '@/lib/url';
import { cn } from '@/lib/utils';

/** Resume carousel cards are 260px wide. The Follio snap is the same paper, 1.5×. */
export const RESUME_CARD_WIDTH_PX = 260;
export const FOLLIO_SNAP_WIDTH_PX = Math.round(RESUME_CARD_WIDTH_PX * 1.5);
export const FOLLIO_SNAP_HEIGHT_PX = Math.round(
  (FOLLIO_SNAP_WIDTH_PX * LETTER_PAGE_HEIGHT_PX) / LETTER_PAGE_WIDTH_PX
);

interface FollioThumbnailProps {
  handle: string;
  href: string;
  className?: string;
}

/**
 * Live Follio snapshot — same letter-ratio iframe as resume cards, 1.5× size.
 */
export function FollioThumbnail({ handle, href, className }: FollioThumbnailProps) {
  return (
    <div
      className={cn(
        'relative w-full shrink-0 overflow-hidden rounded-lg bg-background ring-1 ring-border/60',
        className
      )}
      style={{ maxWidth: FOLLIO_SNAP_WIDTH_PX }}
    >
      <DocumentThumbnail
        previewSrc={getFollioPreviewPath(handle)}
        title="Your Follio"
        maxHeight={FOLLIO_SNAP_HEIGHT_PX}
        className="pointer-events-none bg-background"
      />
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
        aria-label="View your Follio"
      />
    </div>
  );
}
