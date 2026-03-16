'use client';

import { PenLine, WandSparkles } from 'lucide-react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { AllSectionsEditor } from './components/all-sections-editor';
import { BuilderStoreProvider, useBuilderStore } from './components/builder-store-provider';
import { BuilderToolbar } from './components/builder-toolbar';
import { DesignerPanel } from './components/designer-panel';
import { ImportSuggestionDialog } from './components/import-suggestion-dialog';
import { ResumePreviewPanel } from './components/resume-preview-panel';

import type { FullProfile, ProfileSection } from '@/types';

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

interface BuilderLayoutClientProps {
  profile: FullProfile;
  /** children is accepted for Next.js layout compatibility but not rendered — all sections render inline via AllSectionsEditor */
  children?: React.ReactNode;
}

export function BuilderLayoutClient({ profile }: BuilderLayoutClientProps) {
  const [sections, setSections] = useState<ProfileSection[]>(profile.sections || []);

  // Fetch sections if not present (defensive)
  useEffect(() => {
    if (!sections.length) {
      fetch('/api/profile/sections')
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((data) => setSections(data))
        .catch((err) => console.error('Failed to fetch sections:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.length]);

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
// Inner layout (inside the store provider)
// ──────────────────────────────────────────────

interface BuilderLayoutInnerProps {
  sections: ProfileSection[];
}

function BuilderLayoutInner({ sections }: BuilderLayoutInnerProps) {
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const storeSections = useBuilderStore((s) => s.draftProfile.sections);
  const [designerActive, setDesignerActive] = useState(false);

  const toggleDesigner = useCallback(() => {
    setDesignerActive((prev) => !prev);
  }, []);

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
        {/* Toolbar — spans full width */}
        <div className="sticky top-0 z-20 flex-shrink-0 border-b border-border/40 bg-muted/50 backdrop-blur-sm">
          <BuilderToolbar />
        </div>

        {/* Content area — on xl+ fixed height with overflow hidden for sliding */}
        <div className="relative flex-1 xl:min-h-0 xl:overflow-hidden">
          {/* ── 3-panel sliding strip ── */}
          <div
            className="builder-slide flex h-full"
            data-designer-active={designerActive || undefined}
          >
            {/* ── Panel 1: Editor ── */}
            <main className="flex w-full min-w-0 flex-col bg-muted/50 xl:w-auto xl:flex-[4_0_0%] xl:overflow-y-auto">
              <div className="min-h-[60vh] flex-1">
                <div className="flat-cards mx-auto max-w-3xl px-5 py-6">
                  <AllSectionsEditor />
                </div>
              </div>
            </main>

            {/* ── Panel 2: Resume Preview ── */}
            <div className="hidden min-w-0 border-l border-border/40 bg-muted/20 xl:flex xl:flex-[5_0_0%]">
              <div className="h-full w-full overflow-hidden">
                <ResumePreviewPanel />
              </div>
            </div>

            {/* ── Panel 3: Designer ── */}
            <aside className="hidden min-w-0 border-l border-border/40 bg-background xl:flex xl:flex-[4_0_0%] xl:flex-col">
              <DesignerPanel />
            </aside>
          </div>

          {/* ── Gutter tab: Designer (right edge, visible when editor mode) ── */}
          <button
            type="button"
            onClick={toggleDesigner}
            aria-label="Open designer panel"
            className={cn(
              'absolute right-0 top-1/2 z-30 -translate-y-1/2',
              'hidden flex-col items-center gap-3 px-2 py-[22px] xl:flex',
              'rounded-l-lg border border-r-0 border-primary/30',
              'bg-primary shadow-lg shadow-primary/25',
              'text-primary-foreground hover:bg-primary/90',
              'transition-all duration-300 ease-out',
              'hover:px-3 hover:shadow-xl hover:shadow-primary/30',
              designerActive && 'pointer-events-none opacity-0'
            )}
          >
            <WandSparkles className="h-[22px] w-[22px]" />
            <span className="text-[14px] font-medium [writing-mode:vertical-rl]">Designer</span>
          </button>

          {/* ── Gutter tab: Content (left edge, visible when designer mode) ── */}
          <button
            type="button"
            onClick={toggleDesigner}
            aria-label="Return to content editor"
            className={cn(
              'absolute left-0 top-1/2 z-30 -translate-y-1/2',
              'hidden flex-col items-center gap-3 px-2 py-[22px] xl:flex',
              'rounded-r-lg border border-l-0 border-primary/30',
              'bg-primary shadow-lg shadow-primary/25',
              'text-primary-foreground hover:bg-primary/90',
              'transition-all duration-300 ease-out',
              'hover:px-3 hover:shadow-xl hover:shadow-primary/30',
              !designerActive && 'pointer-events-none opacity-0'
            )}
          >
            <PenLine className="h-[22px] w-[22px]" />
            <span className="text-[14px] font-medium [writing-mode:vertical-rl]">Content</span>
          </button>
        </div>
      </TooltipProvider>
    </div>
  );
}
