'use client';

import { DocumentThumbnail } from '@/components/document-preview/document-thumbnail';

import { PortfolioResumeBadge } from './portfolio-resume-badge';
import { PublicResumeBadge } from './public-resume-badge';

/**
 * ResumeThumbnail
 *
 * Thin resume-specific wrapper around shared {@link DocumentThumbnail}.
 * Preview source and badges stay here; scale/skeleton/error live in the foundation.
 */
interface ResumeThumbnailProps {
  /** Profile ID used to construct the preview URL. */
  profileId: string;
  /** When true, shows a parsing overlay instead of the iframe preview. */
  isImporting?: boolean;
  /** CSS class applied to the outer container. */
  className?: string;
  /** Override the maximum visible height (px). Defaults to 260. */
  maxHeight?: number;
  /** Show the Public badge overlay. */
  showPublicBadge?: boolean;
  /**
   * Show the Portfolio badge overlay (portfolio product only).
   * Ignored when `showPublicBadge` is true so Public wins.
   */
  showPortfolioBadge?: boolean;
}

export function ResumeThumbnail({
  profileId,
  isImporting = false,
  className,
  maxHeight,
  showPublicBadge = false,
  showPortfolioBadge = false,
}: ResumeThumbnailProps) {
  const badge = showPublicBadge ? (
    <PublicResumeBadge />
  ) : showPortfolioBadge ? (
    <PortfolioResumeBadge />
  ) : null;

  return (
    <DocumentThumbnail
      previewSrc={`/resume-preview/${profileId}`}
      title="Resume preview"
      className={className}
      maxHeight={maxHeight}
      isLoadingOverlay={isImporting}
      loadingLabel="Parsing resume…"
      badge={badge}
    />
  );
}
