'use client';

import { Check, Copy, Download, ExternalLink, Maximize2, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { FloatingActionCluster, FloatingIconButton } from '@/components/floating-icon-button';
import { ResumeActionsKebab, type ResumeActionsKebabItem } from '@/components/resume-actions-kebab';
import { useCopyElementText } from '@/lib/hooks';

import { useBuilderStore } from './builder-store-provider';
import { DownloadDialog } from './download-dialog';
import { ShareDialog } from '@/components/share-dialog';
import { resolveResumePageLayout } from '@/lib/resume/page-layout';

interface PreviewFloatingActionsProps {
  /** Called when the user clicks the maximize/zoom icon. */
  onZoom: () => void;
  /**
   * Ref to the rendered resume DOM in the preview panel. Used as the
   * source for the "Copy text" affordance — copies the visible text
   * exactly as the public page would.
   */
  resumeRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Optional DOM element to portal the kebab menu into. When provided,
   * a `⋮` trigger renders at that anchor that opens a dropdown of the
   * same actions exposed by the floating cluster — same handlers, same
   * dialogs.
   */
  kebabContainer?: HTMLElement | null;
  className?: string;
}

/**
 * PreviewFloatingActions
 *
 * Translucent icon cluster overlaid on the resume preview. Mirrors the
 * public resume page's `<PublicResumeActions>` so the owner sees the
 * same icons in the same order on both surfaces, with two extras only
 * the builder needs (Open large preview, Open as visitor).
 *
 * Order: Open large preview · Copy text · Download · Open as visitor · Share
 *
 * The kebab menu (when `kebabContainer` is provided) renders the same
 * action set in dropdown form. Both surfaces dispatch to the same
 * handlers and dialogs — the kebab is purely a redundant entry point
 * for users who expect a `⋮` affordance.
 */
export function PreviewFloatingActions({
  onZoom,
  resumeRef,
  kebabContainer,
  className,
}: PreviewFloatingActionsProps) {
  const profile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const handle = profile.handle;
  const resumeTitle = profile.resumeTitle || 'Untitled Resume';

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { copied, copy: handleCopyText } = useCopyElementText(resumeRef);

  const handleViewExternal = () => {
    window.open(`/u/${handle}/resume`, '_blank', 'noopener,noreferrer');
  };

  // Single source of truth for action descriptors so the floating
  // cluster and the kebab menu can never drift apart.
  const kebabItems = useMemo<ResumeActionsKebabItem[]>(
    () => [
      {
        key: 'zoom',
        label: 'Open large preview',
        icon: <Maximize2 />,
        onClick: onZoom,
      },
      {
        key: 'copy',
        label: copied ? 'Copied!' : 'Copy text',
        icon: copied ? <Check className="text-green-600" /> : <Copy />,
        onClick: handleCopyText,
      },
      {
        key: 'download',
        label: 'Download as PDF',
        icon: <Download />,
        onClick: () => setDownloadOpen(true),
      },
      {
        key: 'view-external',
        label: 'View in Full Window',
        icon: <ExternalLink />,
        onClick: handleViewExternal,
      },
      {
        key: 'share',
        label: 'Share resume',
        icon: <Share2 />,
        onClick: () => setShareOpen(true),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copied, handleCopyText, onZoom]
  );

  return (
    <>
      <FloatingActionCluster className={className}>
        <FloatingIconButton label="Open large preview" onClick={onZoom}>
          <Maximize2 className="h-[18px] w-[18px]" />
        </FloatingIconButton>

        <FloatingIconButton label={copied ? 'Copied!' : 'Copy text'} onClick={handleCopyText}>
          {copied ? (
            <Check className="h-[18px] w-[18px] text-green-600" />
          ) : (
            <Copy className="h-[18px] w-[18px]" />
          )}
        </FloatingIconButton>

        <FloatingIconButton label="Download as PDF" onClick={() => setDownloadOpen(true)}>
          <Download className="h-[18px] w-[18px]" />
        </FloatingIconButton>

        <FloatingIconButton label="View as visitor (opens in new tab)" onClick={handleViewExternal}>
          <ExternalLink className="h-[18px] w-[18px]" />
        </FloatingIconButton>

        <FloatingIconButton label="Share resume" onClick={() => setShareOpen(true)}>
          <Share2 className="h-[18px] w-[18px]" />
        </FloatingIconButton>
      </FloatingActionCluster>

      {/* Hidden controllers — render the dialogs but suppress their default triggers. */}
      <DownloadDialog
        handle={handle}
        resumeTitle={resumeTitle}
        resumePageLayout={resolveResumePageLayout(profile.resumeDesign)}
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        onShareClick={() => setShareOpen(true)}
      />
      <ShareDialog
        profile={profile}
        open={shareOpen}
        onOpenChange={setShareOpen}
        hideTrigger
        onVisibilityChange={(visibility) => {
          commitInlineChange({ resumeVisibility: visibility });
        }}
      />

      {kebabContainer
        ? createPortal(<ResumeActionsKebab items={kebabItems} />, kebabContainer)
        : null}
    </>
  );
}
