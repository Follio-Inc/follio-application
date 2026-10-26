'use client';

import { AlignLeft, FileText, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { useBuilderPane } from '@/components/document-builder/document-builder-shell';
import { FollioPage } from '@/components/follio/follio-page';
import { ResumeColorThemeSwitch } from '@/components/resume-color-theme-switch';
import { ResumePageLayoutSwitch } from '@/components/resume-page-layout-switch';
import { ResumePresentationSwitch } from '@/components/resume-presentation/resume-presentation-switch';
import { ViewHighlightsButton } from '@/components/resume-presentation/view-highlights-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { closeBuilderSide } from '@/lib/document-builder';
import { isPortfolioEnabled } from '@/lib/features';
import { buildFollioIdentity } from '@/lib/follio-identity';
import { glanceHasNotes, parseResumeGlance, type ResumeGlance } from '@/lib/resume/glance';
import { getResumeSheetWidthPx, resolveResumePageLayout } from '@/lib/resume/page-layout';
import { resumePresentationHref, type ResumePresentation } from '@/lib/resume/presentation';
import { cn } from '@/lib/utils';
import {
  RESUME_DESIGN_DEFAULTS,
  type PublicProfile,
  type ResumeColorTheme,
  type ResumePageLayout,
} from '@/types';

import { useJustifyAll } from '../lib/use-justify-all';
import { useAiEditReview } from './ai-edit/ai-edit-review';
import { REDLINE_GUTTER_PX, RedlineControls, RedlineReviewBar } from './ai-edit/redline-review';
import { useBuilderStore } from './builder-store-provider';
import { PreviewFloatingActions } from './preview-floating-actions';
import { ResumeConstructionOverlay, useResumeConstruction } from './resume-construction-overlay';

// Zoom modal is only mounted when the user clicks the resume — defer its
// chunk so it doesn't bloat the initial preview bundle.
const ResumeZoomModal = dynamic(
  () => import('./resume-zoom-modal').then((m) => ({ default: m.ResumeZoomModal })),
  { ssr: false }
);

const HORIZONTAL_PADDING_PX = 48;
const STAGE_RIGHT_PADDING_PX = 56;
/** Follio reading column (`max-w-2xl`) — scaled to fit the preview stage. */
const FOLLIO_PREVIEW_WIDTH_PX = 672;

/** About half a minute: long enough for the highlights prompt to finish after a save. */
const GLANCE_POLL_MS = 2500;
const GLANCE_POLL_ATTEMPTS = 12;

const GLANCE_STATUS_COPY = {
  writing: 'Writing highlights for this resume…',
  empty: 'No highlights yet. Add results to your experience bullets, then open Highlights again.',
} as const;

/**
 * ResumePreviewPanel
 *
 * Reads from the builder zustand store so the preview updates in real-time
 * as the user edits fields — no API round-trip needed.
 *
 * Overlays:
 * - Resume | Follio swaps this preview for the Follio view of the same draft.
 *   Page size and color stay on the paper resume. Editing updates the Follio
 *   in place.
 * - View Highlights, pinned to the resume's top-right, draws the stored
 *   highlights into this resume (marker phrases, plus an impact box and
 *   skill tags under each company) and closes Content and Design.
 *   Editing, a template change, or a click outside returns the plain resume.
 * - Floating action cluster (Zoom / Download / View / Share) anchored to the
 *   bottom center of the panel; stays in place when the user scrolls.
 * - Click-to-zoom region: clicking the resume opens a centered zoom modal.
 * - AI suggestions, while the AI panel is open: drawn into the resume with
 *   Keep and Skip beside each one and Keep all above. Zoom, Download, and
 *   Highlights step aside meanwhile, so no export ever carries the marks.
 */
export function ResumePreviewPanel() {
  const profile = useBuilderStore((s) => s.draftProfile);
  const pane = useBuilderPane();
  const panelRef = useRef<HTMLDivElement>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [glance, setGlance] = useState<ResumeGlance | null>(() =>
    parseResumeGlance(profile.resumeGlance)
  );
  const [glanceStatus, setGlanceStatus] = useState<'ready' | 'writing' | 'empty'>('ready');
  const highlightsDraftRef = useRef(profile);
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const colorTheme = profile.resumeDesign?.colorTheme ?? RESUME_DESIGN_DEFAULTS.colorTheme;
  const pageLayout = resolveResumePageLayout(profile.resumeDesign);
  const [presentation, setPresentation] = useState<ResumePresentation>('resume');
  const isFollio = presentation === 'follio';
  const nativeWidthPx = isFollio ? FOLLIO_PREVIEW_WIDTH_PX : getResumeSheetWidthPx(pageLayout);
  const follioIdentity = useMemo(
    () =>
      buildFollioIdentity(profile as unknown as PublicProfile, {
        showResume: true,
        showWork: isPortfolioEnabled(),
      }),
    [profile]
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const resumeContentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Deferred so typing in a suggestion's card does not hold up the keystroke.
  const redline = useDeferredValue(useAiEditReview().redline);
  const reviewing = redline !== null;
  // Anchor element for the kebab menu — sits at the resume sheet's
  // top-right. Stored in state (not a ref) so the action component
  // re-renders once the DOM node is available and can portal into it.
  const [kebabAnchor, setKebabAnchor] = useState<HTMLDivElement | null>(null);
  const construction = useResumeConstruction();

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

  // Editing or a design change (template, theme, layout) returns to the resume.
  useEffect(() => {
    if (!showHighlights) {
      highlightsDraftRef.current = profile;
      return;
    }
    if (highlightsDraftRef.current !== profile) {
      setShowHighlights(false);
    }
  }, [showHighlights, profile]);

  // A click outside the preview returns the plain resume. Escape does the same.
  useEffect(() => {
    if (!showHighlights) return;

    const dismiss = () => setShowHighlights(false);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!panelRef.current?.contains(target)) dismiss();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showHighlights]);

  const readStoredGlance = useCallback(async (): Promise<ResumeGlance | null> => {
    try {
      const response = await fetch('/api/profile/glance');
      if (!response.ok) return null;
      const body = (await response.json()) as { glance?: unknown };
      const next = parseResumeGlance(body.glance);
      setGlance(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  // Highlights are written after a save or an import. Opening them while the
  // prompt is still running keeps asking for a short while, then says so.
  useEffect(() => {
    if (!showHighlights) {
      setGlanceStatus('ready');
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const next = await readStoredGlance();
      if (cancelled) return;
      if (glanceHasNotes(next)) {
        setGlanceStatus('ready');
        return;
      }
      attempts += 1;
      if (attempts >= GLANCE_POLL_ATTEMPTS) {
        setGlanceStatus('empty');
        return;
      }
      setGlanceStatus('writing');
      timer = setTimeout(check, GLANCE_POLL_MS);
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [showHighlights, readStoredGlance]);

  const showPresentation = useCallback((next: ResumePresentation) => {
    setPresentation(next);
    if (next === 'follio') setShowHighlights(false);
  }, []);

  const openHighlights = useCallback(() => {
    setPresentation('resume');
    setZoomOpen(false);
    pane?.setMode((mode) => closeBuilderSide(mode));
    setShowHighlights(true);
  }, [pane]);

  const closeHighlights = useCallback(() => setShowHighlights(false), []);

  // Suggestions and highlights both draw on the resume; suggestions win.
  useEffect(() => {
    if (!reviewing) return;
    setPresentation('resume');
    setShowHighlights(false);
    setZoomOpen(false);
  }, [reviewing]);

  const gutter = reviewing ? REDLINE_GUTTER_PX : 0;

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - HORIZONTAL_PADDING_PX - gutter;
      const next = Math.min(containerWidth / nativeWidthPx, 1);
      setScale(next);
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [gutter, nativeWidthPx]);

  // Visible width of the scaled resume sheet (px)
  const sheetWidth = nativeWidthPx * scale;

  return (
    <div ref={panelRef} className="relative flex h-full flex-col">
      {/* ── Slim panel header — labels the column, keeps the surface calm ── */}
      <div className="builder-panel flex h-12 shrink-0 items-center justify-between border-b border-border/30 px-6">
        <span className="text-eyebrow">
          {construction.active
            ? 'Building resume'
            : reviewing
              ? 'Suggestions'
              : isFollio
                ? 'Follio'
                : showHighlights
                  ? 'Highlights'
                  : 'Preview'}
        </span>
        <div className="flex items-center gap-2">
          {reviewing ? null : (
            <ResumePresentationSwitch value={presentation} onChange={showPresentation} />
          )}
          {isFollio ? null : (
            <>
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
            </>
          )}
        </div>
      </div>

      {reviewing && <RedlineReviewBar />}

      <ResumeConstructionOverlay
        active={construction.active}
        progress={construction.progress}
        status={construction.status}
        showRefreshHint={construction.showRefreshHint}
      />

      {/* Soft stage under the resume — lighter than base chrome, darker than paper.
          The resume stays mounted. Highlights are drawn into it. */}
      <div ref={containerRef} className="builder-stage relative min-h-0 flex-1 overflow-hidden">
        <div
          className="scrollbar-thin absolute inset-0 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-6"
          style={{ paddingRight: STAGE_RIGHT_PADDING_PX + gutter }}
        >
          <div ref={sheetRef} className="relative mx-auto" style={{ width: sheetWidth }}>
            <div
              className={cn(
                'builder-paper group block w-full overflow-hidden rounded-md',
                'focus-within:ring-2 focus-within:ring-primary/40'
              )}
            >
              <div className="overflow-hidden" style={{ zoom: scale }}>
                <div ref={resumeContentRef} className="[&>.resume-actions]:hidden">
                  {isFollio ? (
                    <FollioPage identity={follioIdentity} interactive={false} />
                  ) : (
                    <CleanResumeView
                      profile={profile as unknown as PublicProfile}
                      highlights={showHighlights ? glance : null}
                      redline={redline}
                    />
                  )}
                </div>
              </div>
            </div>

            {redline && !isFollio ? <RedlineControls rootRef={sheetRef} redline={redline} /> : null}

            {showHighlights || reviewing ? null : (
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                aria-label={isFollio ? 'Open large Follio view' : 'Open large preview'}
                className={cn(
                  'absolute inset-0 z-10 h-full w-full cursor-zoom-in rounded-md',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                )}
              />
            )}

            <div
              ref={setKebabAnchor}
              className="absolute left-full top-0 z-20 ml-2"
              aria-hidden="true"
            />

            {!isFollio && !allJustified && !showHighlights && !reviewing && (
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

        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-6"
        >
          {showHighlights && glanceStatus !== 'ready' ? (
            <p className="flex max-w-md items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground shadow-sm backdrop-blur">
              {glanceStatus === 'writing' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : null}
              {GLANCE_STATUS_COPY[glanceStatus]}
            </p>
          ) : null}
        </div>

        {reviewing || isFollio ? null : (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-30 px-6 pr-14">
            <div className="relative mx-auto h-0" style={{ width: sheetWidth }}>
              <div className="absolute right-6 top-6">
                <ViewHighlightsButton
                  label={showHighlights ? 'View resume' : 'View Highlights'}
                  icon={showHighlights ? <FileText className="h-[18px] w-[18px]" /> : undefined}
                  onClick={showHighlights ? closeHighlights : openHighlights}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating action cluster — anchored to the bottom-center of
            the preview panel so it mirrors the public resume view's
            placement. Sits outside the scrollable area so it stays put
            as the user scrolls the resume. Hidden while highlights
            are drawn, so Download never exports them. ── */}
      {showHighlights || reviewing ? null : (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
          <PreviewFloatingActions
            onZoom={() => setZoomOpen(true)}
            resumeRef={resumeContentRef}
            kebabContainer={kebabAnchor}
            visitorHref={resumePresentationHref(profile.handle, presentation)}
          />
        </div>
      )}

      {/* ── Zoom modal ──────────────────────────────────────────────── */}
      <ResumeZoomModal
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        onViewHighlights={openHighlights}
        presentation={presentation}
        profile={profile as unknown as PublicProfile}
      />
    </div>
  );
}
