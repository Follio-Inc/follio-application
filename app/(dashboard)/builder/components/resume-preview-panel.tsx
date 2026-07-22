'use client';

import { AlignLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { ResumeColorThemeSwitch } from '@/components/resume-color-theme-switch';
import { ResumePageLayoutSwitch } from '@/components/resume-page-layout-switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getResumeSheetWidthPx, resolveResumePageLayout } from '@/lib/resume/page-layout';
import {
  RESUME_DESIGN_DEFAULTS,
  type PublicProfile,
  type ResumeColorTheme,
  type ResumePageLayout,
} from '@/types';

import { useJustifyAll } from '../lib/use-justify-all';
import { useBuilderStore } from './builder-store-provider';
import { PreviewFloatingActions } from './preview-floating-actions';

// Zoom modal is only mounted when the user clicks the resume — defer its
// chunk so it doesn't bloat the initial preview bundle.
const ResumeZoomModal = dynamic(
  () => import('./resume-zoom-modal').then((m) => ({ default: m.ResumeZoomModal })),
  { ssr: false }
);

const HORIZONTAL_PADDING_PX = 48;

/**
 * ResumePreviewPanel
 *
 * Reads from the builder zustand store so the preview updates in real-time
 * as the user edits fields — no API round-trip needed.
 *
 * Overlays:
 * - Floating action cluster (Zoom / Download / View / Share) anchored to the
 *   panel's top-right; stays in place when the user scrolls the resume.
 * - Click-to-zoom region: clicking the resume opens a centered zoom modal.
 */
export function ResumePreviewPanel() {
  const profile = useBuilderStore((s) => s.draftProfile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const colorTheme = profile.resumeDesign?.colorTheme ?? RESUME_DESIGN_DEFAULTS.colorTheme;
  const pageLayout = resolveResumePageLayout(profile.resumeDesign);
  const nativeWidthPx = getResumeSheetWidthPx(pageLayout);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const resumeContentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Anchor element for the kebab menu — sits at the resume sheet's
  // top-right. Stored in state (not a ref) so the action component
  // re-renders once the DOM node is available and can portal into it.
  const [kebabAnchor, setKebabAnchor] = useState<HTMLDivElement | null>(null);

  const { allJustified, justifyAll: handleJustifyAll } = useJustifyAll();

  const persistDesign = useCallback(
    (patch: { colorTheme?: ResumeColorTheme; pageLayout?: ResumePageLayout }) => {
      const nextDesign = {
        ...RESUME_DESIGN_DEFAULTS,
        ...(profile.resumeDesign ?? {}),
        ...patch,
      };

      commitInlineChange({ resumeDesign: nextDesign } as Partial<typeof profile>);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch('/api/profile/resume-design', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nextDesign),
          });
        } catch (err) {
          console.error('Failed to save resume design:', err);
        }
      }, 600);
    },
    [commitInlineChange, profile]
  );

  const handleColorThemeChange = useCallback(
    (nextTheme: ResumeColorTheme) => {
      persistDesign({ colorTheme: nextTheme });
    },
    [persistDesign]
  );

  const handlePageLayoutChange = useCallback(
    (nextLayout: ResumePageLayout) => {
      persistDesign({ pageLayout: nextLayout });
    },
    [persistDesign]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - HORIZONTAL_PADDING_PX;
      const next = Math.min(containerWidth / nativeWidthPx, 1);
      setScale(next);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [nativeWidthPx]);

  // Visible width of the scaled resume sheet (px)
  const sheetWidth = nativeWidthPx * scale;

  return (
    <div className="relative flex h-full flex-col">
      {/* ── Slim panel header — labels the column, keeps the surface calm ── */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-6">
        <span className="text-eyebrow">Preview</span>
        <div className="flex items-center gap-2">
          <ResumePageLayoutSwitch
            variant="compact"
            value={pageLayout}
            onChange={handlePageLayoutChange}
          />
          <ResumeColorThemeSwitch
            variant="compact"
            value={colorTheme}
            onChange={handleColorThemeChange}
          />
        </div>
      </div>

      {/* ── Scrollable preview area ─────────────────────────────────── */}
      <div
        ref={containerRef}
        className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pr-14 pt-6"
      >
        {/* Centered sheet wrapper */}
        <div className="relative mx-auto" style={{ width: sheetWidth }}>
          {/* Resume content. We intentionally do NOT wrap this in a <button>
              because the resume itself renders interactive controls
              (e.g. ResumeActions copy/print buttons), and nesting buttons
              is invalid HTML and causes a React hydration error. The
              click-to-zoom affordance is provided by the absolutely
              positioned overlay button below. */}
          <div
            className={cn(
              'group block w-full overflow-hidden rounded-md',
              'focus-within:ring-2 focus-within:ring-primary/40'
            )}
          >
            <div className="overflow-hidden" style={{ zoom: scale }}>
              {/* Hide ResumeActions (print/copy buttons) in preview mode.
                  No top padding here — the scrollable parent already
                  provides spacing, and removing it lets the kebab
                  anchor (`top-0` on the sheet wrapper) line up exactly
                  with the resume's top edge. */}
              <div ref={resumeContentRef} className="[&>.resume-actions]:hidden">
                <CleanResumeView
                  profile={profile as unknown as PublicProfile}
                  allContentJustified={allJustified}
                  onJustifyAll={handleJustifyAll}
                />
              </div>
            </div>
          </div>

          {/* Click-to-zoom overlay. Sits above the resume content and
              captures clicks for opening the large preview. Inner
              interactive controls (floating actions, justify button) are
              rendered with a higher z-index so they remain clickable. */}
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            aria-label="Open large preview"
            className={cn(
              'absolute inset-0 z-10 h-full w-full cursor-zoom-in rounded-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
            )}
          />

          {/* (Floating action cluster moved out of the sheet wrapper
                so it can anchor to the panel rather than the resume's
                top-right corner — see below.) */}

          {/* Kebab anchor — sits at the top-right of the sheet. The
              actual menu is portalled in by `<PreviewFloatingActions>`
              so it shares state with the bottom cluster. Sits above
              the click-to-zoom overlay (`z-20` > `z-10`) so the kebab
              trigger remains interactive. */}
          <div
            ref={setKebabAnchor}
            className="absolute left-full top-0 z-20 ml-2"
            aria-hidden="true"
          />

          {/* ── Justify-all overlay (top-left of resume). Only visible when
                some content is not yet justified — disappears once all
                paragraphs are justified. Mirrors the right-side cluster. ── */}
          {!allJustified && (
            <div className="absolute left-3 top-8 z-20">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleJustifyAll}
                    aria-label="Justify all text"
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full',
                      'border border-destructive/40 bg-destructive/10 text-destructive shadow-sm backdrop-blur-md',
                      'opacity-80 transition-all duration-200',
                      'hover:bg-destructive/20 hover:opacity-100 hover:shadow-md',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40'
                    )}
                  >
                    <AlignLeft className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Justify all text
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating action cluster — anchored to the bottom-center of
            the preview panel so it mirrors the public resume view's
            placement. Sits outside the scrollable area so it stays put
            as the user scrolls the resume. ── */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
        <PreviewFloatingActions
          onZoom={() => setZoomOpen(true)}
          resumeRef={resumeContentRef}
          kebabContainer={kebabAnchor}
        />
      </div>

      {/* ── Zoom modal ──────────────────────────────────────────────── */}
      <ResumeZoomModal
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        profile={profile as unknown as PublicProfile}
        allContentJustified={allJustified}
        onJustifyAll={handleJustifyAll}
      />
    </div>
  );
}
