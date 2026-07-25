'use client';

import { ChevronLeft, ChevronRight, PenLine, WandSparkles, type LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { AllSectionsEditor } from './components/all-sections-editor';
import { BuilderContentHeader } from './components/builder-content-header';
import { BuilderMobileBar } from './components/builder-mobile-bar';
import { BuilderStoreProvider, useBuilderStore } from './components/builder-store-provider';
import { ResumePreviewPanel } from './components/resume-preview-panel';
import {
  DEFAULT_BUILDER_VIEW_MODE,
  builderSideCollapseLabel,
  closeBuilderSide,
  escapeBuilderViewMode,
  isBuilderDesignerActive,
  isBuilderPreviewOnly,
  isContentEdgeTabVisible,
  isDesignEdgeTabVisible,
  openBuilderSide,
  type BuilderViewMode,
} from './lib/pane-layout';

import type { FullProfile, ProfileSection } from '@/types';

// Designer panel is only visible when the user opens the Designer tab —
// load it on demand so the initial editor bundle stays small.
const DesignerPanel = dynamic(
  () => import('./components/designer-panel').then((m) => ({ default: m.DesignerPanel })),
  { ssr: false }
);

// Import suggestion dialog only opens in response to a user action — defer it.
const ImportSuggestionDialog = dynamic(
  () =>
    import('./components/import-suggestion-dialog').then((m) => ({
      default: m.ImportSuggestionDialog,
    })),
  { ssr: false }
);

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

interface BuilderLayoutClientProps {
  profile: FullProfile;
  /** children is accepted for Next.js layout compatibility but not rendered — all sections render inline via AllSectionsEditor */
  children?: React.ReactNode;
}

export function BuilderLayoutClient({ profile }: BuilderLayoutClientProps) {
  // Server layout guarantees default sections exist before this component
  // mounts, so we can trust `profile.sections` and avoid a defensive
  // client-side fetch that adds a roundtrip on every builder open.
  const sections = profile.sections ?? [];

  return (
    <BuilderStoreProvider profile={profile}>
      <BuilderLayoutInner sections={sections} />
      <Suspense fallback={null}>
        <ImportSuggestionDialog />
      </Suspense>
    </BuilderStoreProvider>
  );
}

// ──────────────────────────────────────────────
// Edge tab — vertical drawer handle (Content left · Design right)
// ──────────────────────────────────────────────

interface BuilderEdgeTabProps {
  side: 'left' | 'right';
  label: string;
  icon: LucideIcon;
  visible: boolean;
  onClick: () => void;
  tooltip: string;
}

/**
 * Vertical tab pinned to a viewport edge, styled with theme primary tokens.
 * Only the *inactive* panel's tab is shown — it invites the user to slide that
 * panel in from its side, matching the builder-slide transform direction.
 */
function BuilderEdgeTab({
  side,
  label,
  icon: Icon,
  visible,
  onClick,
  tooltip,
}: BuilderEdgeTabProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={tooltip}
          tabIndex={visible ? 0 : -1}
          className={cn(
            'absolute top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2.5 xl:flex',
            'border border-primary/30 bg-primary px-2 py-5',
            'text-primary-foreground shadow-md shadow-primary/20',
            'ease-[cubic-bezier(0.16,1,0.3,1)] transition-all duration-500',
            'hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            side === 'left' ? 'left-0 rounded-r-xl border-l-0' : 'right-0 rounded-l-xl border-r-0',
            visible ? 'translate-x-0 opacity-100' : 'pointer-events-none opacity-0',
            !visible && side === 'left' && '-translate-x-2',
            !visible && side === 'right' && 'translate-x-2'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.06em] [writing-mode:vertical-rl]',
              side === 'left' ? 'rotate-180' : ''
            )}
          >
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side={side === 'left' ? 'right' : 'left'} className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ──────────────────────────────────────────────
// Subtle seam chevron — close the active side → preview-only
// ──────────────────────────────────────────────

interface BuilderSideCollapseProps {
  mode: Exclude<BuilderViewMode, 'preview'>;
  onCollapse: () => void;
}

function BuilderSideCollapse({ mode, onCollapse }: BuilderSideCollapseProps) {
  const label = builderSideCollapseLabel(mode);
  if (!label) return null;

  const isContent = mode === 'content';
  const Icon = isContent ? ChevronLeft : ChevronRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={label}
          className={cn(
            'absolute top-1/2 z-30 hidden h-10 w-4 -translate-y-1/2 items-center justify-center xl:flex',
            'border border-border/70 bg-background/90 text-muted-foreground dark:border-border dark:bg-muted',
            'shadow-sm backdrop-blur-sm',
            'transition-[color,background-color,box-shadow,opacity] duration-200',
            'hover:bg-muted hover:text-foreground dark:hover:bg-muted/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            isContent ? 'left-0 -translate-x-1/2 rounded-md' : 'right-0 translate-x-1/2 rounded-md'
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={isContent ? 'right' : 'left'} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ──────────────────────────────────────────────
// Inner layout (inside the store provider)
// ──────────────────────────────────────────────

interface BuilderLayoutInnerProps {
  sections: ProfileSection[];
}

function BuilderLayoutInner({ sections }: BuilderLayoutInnerProps) {
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const storeSections = useBuilderStore((s) => s.draftProfile.sections);
  const [mode, setMode] = useState<BuilderViewMode>(DEFAULT_BUILDER_VIEW_MODE);

  const designerActive = isBuilderDesignerActive(mode);
  const previewOnly = isBuilderPreviewOnly(mode);

  const openDesign = useCallback(() => setMode((m) => openBuilderSide(m, 'designer')), []);
  const openContent = useCallback(() => setMode((m) => openBuilderSide(m, 'content')), []);
  const closeSide = useCallback(() => setMode((m) => closeBuilderSide(m)), []);

  // Escape returns to content when the design panel is open (desktop).
  useEffect(() => {
    if (!designerActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMode((m) => escapeBuilderViewMode(m));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [designerActive]);

  // Keep sections in sync with the zustand store so the preview stays up-to-date.
  // Only sync from props → store on initial mount or when sections prop identity
  // changes (e.g. server revalidation). Once the user drags to reorder, the store
  // is the source of truth and we should NOT overwrite it with stale prop data.
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (!initialSyncDone.current) {
      // First render: ensure store has the latest sections from the server
      const storeJson = JSON.stringify(
        (storeSections || []).map((s) => ({
          id: s.id,
          isVisible: s.isVisible,
          sortOrder: s.sortOrder,
        }))
      );
      const localJson = JSON.stringify(
        sections.map((s) => ({ id: s.id, isVisible: s.isVisible, sortOrder: s.sortOrder }))
      );
      if (storeJson !== localJson) {
        commitInlineChange({ sections });
      }
      initialSyncDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted/30 xl:h-[calc(100vh-3.5rem)]">
      <TooltipProvider delayDuration={300}>
        {/* Content area — on xl+ fixed height with overflow hidden for sliding */}
        <div className="relative flex-1 xl:min-h-0 xl:overflow-hidden">
          {/* ── 3-panel sliding strip ── */}
          <div
            className="builder-slide flex h-full"
            data-designer-active={designerActive || undefined}
            data-preview-only={previewOnly || undefined}
          >
            {/* ── Panel 1: Editor ── */}
            <main
              className={cn(
                'flex w-full min-w-0 flex-col bg-muted/40 xl:w-auto xl:flex-[4_0_0%] xl:overflow-y-auto',
                previewOnly && 'xl:hidden'
              )}
            >
              <BuilderContentHeader />
              <div className="min-h-[60vh] flex-1 pb-20 xl:pb-8">
                <div className="flat-cards mx-auto max-w-3xl px-6 py-8">
                  <AllSectionsEditor />
                </div>
              </div>
            </main>

            {/* ── Panel 2: Resume Preview ── */}
            <div
              className={cn(
                'relative hidden min-w-0 border-l border-border/60 bg-muted/20 xl:flex',
                previewOnly ? 'xl:flex-1 xl:border-l-0' : 'xl:flex-[5_0_0%]'
              )}
            >
              {mode !== 'preview' ? (
                <BuilderSideCollapse mode={mode} onCollapse={closeSide} />
              ) : null}
              <div className="h-full w-full overflow-hidden">
                <ResumePreviewPanel />
              </div>
            </div>

            {/* ── Panel 3: Designer ── */}
            <aside
              className={cn(
                'hidden min-w-0 border-l border-border/60 bg-background xl:flex xl:flex-[4_0_0%] xl:flex-col',
                previewOnly && 'xl:hidden'
              )}
            >
              <DesignerPanel />
            </aside>
          </div>

          {/* Edge tabs — spatial affordances that match the slide direction */}
          <BuilderEdgeTab
            side="right"
            label="Design"
            icon={WandSparkles}
            visible={isDesignEdgeTabVisible(mode)}
            onClick={openDesign}
            tooltip="Open design panel"
          />
          <BuilderEdgeTab
            side="left"
            label="Content"
            icon={PenLine}
            visible={isContentEdgeTabVisible(mode)}
            onClick={openContent}
            tooltip="Return to content editor"
          />

          <BuilderMobileBar />
        </div>
      </TooltipProvider>
    </div>
  );
}
