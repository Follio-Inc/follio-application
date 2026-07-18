'use client';

import { Check, Copy, Download, Pencil, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { DownloadDialog } from '@/app/(dashboard)/builder/components/download-dialog';
import { FloatingActionCluster, FloatingIconButton } from '@/components/floating-icon-button';
import { ResumeActionsKebab, type ResumeActionsKebabItem } from '@/components/resume-actions-kebab';
import { ShareDialog } from '@/components/share-dialog';
import { ShareLinkDialog } from '@/components/share-link-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCopyElementText } from '@/lib/hooks';
import { getResumeUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

import type { ContentVisibility } from '@prisma/client';

/**
 * PublicResumeActions
 *
 * Floating icon cluster overlaid on the public resume page. Mirrors
 * the visual language of the builder's `<PreviewFloatingActions>` so
 * a logged-in owner sees the same controls in the same shape on both
 * routes — only the affordances they don't need on a public page
 * (Large Preview, Open as Visitor) are dropped.
 *
 * Action matrix:
 *  - Copy text → always available; copies the resume's plain text
 *    content to the clipboard. Replaces the older labelled "Copy"
 *    button.
 *  - Download → opens the shared `<DownloadDialog>` (same as builder).
 *  - Share:
 *      • owner       → full `<ShareDialog>` with visibility controls,
 *                      regenerate link, webmail compose, etc.
 *      • non-owner / → minimal `<ShareLinkDialog>` with a single
 *        anonymous     read-only link + copy button.
 *
 * The cluster keeps the existing `resume-actions` class so the
 * builder's preview-mode CSS rule that hides the actions in the
 * scaled preview (`[&>.resume-actions]:hidden`) continues to work.
 */
interface PublicResumeActionsProps {
  /** Ref to the rendered resume DOM, used as the source for "Copy text". */
  resumeRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Resume's profile id. Required to activate the correct resume in
   * the builder before navigating, since the builder reads from the
   * caller's *active* profile rather than a route param.
   */
  profileId: string;
  /** Resume owner's handle. */
  handle: string;
  /** Resume owner's first name (used in dialog copy). */
  firstName: string | null;
  /** Resume document title — used as the download filename. */
  resumeTitle: string;
  /** Owner's current resume visibility — drives the full share dialog. */
  resumeVisibility: ContentVisibility;
  /** Auth context of the visitor, as resolved server-side. */
  authState: 'owner' | 'authenticated' | 'anonymous';
  /**
   * Optional DOM element to portal the kebab menu into. When provided,
   * a `⋮` trigger is rendered at that anchor that opens a dropdown of
   * the same actions exposed by the floating cluster — same handlers,
   * same dialogs.
   */
  kebabContainer?: HTMLElement | null;
}

const IDLE_TIMEOUT_MS = 4000;

export function PublicResumeActions({
  resumeRef,
  profileId,
  handle,
  firstName,
  resumeTitle,
  resumeVisibility,
  authState,
  kebabContainer,
}: PublicResumeActionsProps) {
  const router = useRouter();
  const isOwner = authState === 'owner';

  // #region agent log
  useEffect(() => {
    const isIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    fetch('http://127.0.0.1:7254/ingest/fcf2bd3d-74c8-4090-ab73-f47f4b1cfce0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a3be95' },
      body: JSON.stringify({
        sessionId: 'a3be95',
        runId: 'pre-fix',
        hypothesisId: 'D',
        location: 'public-resume-actions.tsx:mount',
        message: 'PublicResumeActions mounted',
        data: {
          authState,
          isOwner,
          handle,
          pathname: window.location.pathname,
          isIframe,
          willMountShareDialog: isOwner,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [authState, isOwner, handle]);
  // #endregion

  const { copied, copy: handleCopyText } = useCopyElementText(resumeRef);
  const [idle, setIdle] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isOpeningBuilder, setIsOpeningBuilder] = useState(false);
  const [currentVisibility, setCurrentVisibility] = useState<ContentVisibility>(resumeVisibility);
  // Initialise with the SSR-stable URL; resolve to the actual current
  // page URL after mount so query params / unlisted keys are honoured
  // without causing a hydration mismatch.
  const [visitorShareUrl, setVisitorShareUrl] = useState<string>(() => getResumeUrl(handle));

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local visibility when the prop changes (e.g. after refresh).
  useEffect(() => {
    setCurrentVisibility(resumeVisibility);
  }, [resumeVisibility]);

  // Resolve the actual current URL on the client (post-hydration).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVisitorShareUrl(window.location.href);
    }
  }, []);

  // ── Mouse-idle fade — preserves the prior UX of the labelled button ──
  useEffect(() => {
    const resetIdle = () => {
      setIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS);
    };

    idleTimer.current = setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS);

    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('touchstart', resetIdle);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('touchstart', resetIdle);
    };
  }, []);

  // The visitor-share dialog gets the URL the visitor sees right now.
  // For owners the full dialog computes its own URL (handles unlisted
  // keys, etc.) so we don't pre-compute that here.

  /**
   * Activate this resume on the user's account, then navigate to the
   * builder. The builder reads from the caller's *active* profile, so
   * we have to flip the active profile server-side before navigating —
   * otherwise the user could end up editing a different resume than
   * the one they were viewing.
   *
   * Owner-only by construction: the Edit button isn't rendered for
   * non-owners, and the activate endpoint enforces ownership too.
   */
  const handleEdit = async () => {
    if (isOpeningBuilder) return;
    setIsOpeningBuilder(true);
    try {
      const response = await fetch(`/api/resumes/${profileId}/activate`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Failed to activate resume for builder');
      router.push('/builder');
    } catch (err) {
      console.error('Failed to open resume in builder:', err);
      setIsOpeningBuilder(false);
    }
  };

  // Single source of truth for action descriptors so the floating
  // cluster and the kebab menu can never drift apart. Both render
  // from this list and dispatch to the same handlers / dialogs.
  const kebabItems = useMemo<ResumeActionsKebabItem[]>(() => {
    const items: ResumeActionsKebabItem[] = [];
    if (isOwner) {
      items.push({
        key: 'edit',
        label: 'Edit in builder',
        icon: <Pencil />,
        onClick: handleEdit,
        disabled: isOpeningBuilder,
      });
    }
    items.push({
      key: 'copy',
      label: copied ? 'Copied!' : 'Copy text',
      icon: copied ? <Check className="text-green-600" /> : <Copy />,
      onClick: handleCopyText,
    });
    items.push({
      key: 'download',
      label: 'Download as PDF',
      icon: <Download />,
      onClick: () => setDownloadOpen(true),
    });
    items.push({
      key: 'share',
      label: 'Share resume',
      icon: <Share2 />,
      onClick: () => setShareOpen(true),
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, isOpeningBuilder, copied, handleCopyText]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          'resume-actions transition-opacity duration-500 print:hidden',
          idle ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
      >
        <FloatingActionCluster>
          {isOwner ? (
            <FloatingIconButton
              label="Edit in builder"
              onClick={handleEdit}
              disabled={isOpeningBuilder}
            >
              <Pencil className="h-[18px] w-[18px]" />
            </FloatingIconButton>
          ) : null}

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

          <FloatingIconButton label="Share resume" onClick={() => setShareOpen(true)}>
            <Share2 className="h-[18px] w-[18px]" />
          </FloatingIconButton>
        </FloatingActionCluster>
      </div>

      <DownloadDialog
        handle={handle}
        resumeTitle={resumeTitle}
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        onShareClick={() => {
          setDownloadOpen(false);
          setShareOpen(true);
        }}
      />

      {isOwner ? (
        <ShareDialog
          profile={{
            handle,
            firstName,
            resumeVisibility: currentVisibility,
          }}
          open={shareOpen}
          onOpenChange={setShareOpen}
          hideTrigger
          onVisibilityChange={setCurrentVisibility}
        />
      ) : (
        <ShareLinkDialog
          shareUrl={visitorShareUrl}
          ownerFirstName={firstName}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}

      {kebabContainer
        ? createPortal(<ResumeActionsKebab items={kebabItems} />, kebabContainer)
        : null}
    </TooltipProvider>
  );
}
