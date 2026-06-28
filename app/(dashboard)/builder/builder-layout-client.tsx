'use client';

import { PenLine, WandSparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { AllSectionsEditor } from './components/all-sections-editor';
import { BuilderStoreProvider, useBuilderStore } from './components/builder-store-provider';
import { ResumePreviewPanel } from './components/resume-preview-panel';

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
// View toggle — segmented control (Content | Design)
// ──────────────────────────────────────────────

interface ViewSegmentedControlProps {
  designerActive: boolean;
  onChange: (designerActive: boolean) => void;
}

/**
 * Accessible two-option segmented control that drives the sliding panel
 * strip. Each option is a toggle button (aria-pressed) so it is fully
 * keyboard operable via Tab + Enter/Space with no custom focus management.
 */
function ViewSegmentedControl({ designerActive, onChange }: ViewSegmentedControlProps) {
  const options = [
    { value: false, label: 'Content', icon: PenLine },
    { value: true, label: 'Design', icon: WandSparkles },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Editor view"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/60 p-0.5"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const selected = opt.value === designerActive;
        return (
          <button
            key={opt.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
              'transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
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
        {/* ── Editor toolbar: view toggle lives here so it stays put while the
              panel strip slides beneath it (xl only — smaller screens show the
              editor alone with no panels to switch between). ── */}
        <div className="hidden h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background px-5 xl:flex">
          <span className="text-eyebrow">Resume Builder</span>
          <ViewSegmentedControl designerActive={designerActive} onChange={setDesignerActive} />
        </div>

        {/* Content area — on xl+ fixed height with overflow hidden for sliding */}
        <div className="relative flex-1 xl:min-h-0 xl:overflow-hidden">
          {/* ── 3-panel sliding strip ── */}
          <div
            className="builder-slide flex h-full"
            data-designer-active={designerActive || undefined}
          >
            {/* ── Panel 1: Editor ── */}
            <main className="flex w-full min-w-0 flex-col bg-muted/40 xl:w-auto xl:flex-[4_0_0%] xl:overflow-y-auto">
              <div className="min-h-[60vh] flex-1">
                <div className="flat-cards mx-auto max-w-3xl px-6 py-8">
                  <AllSectionsEditor />
                </div>
              </div>
            </main>

            {/* ── Panel 2: Resume Preview ── */}
            <div className="hidden min-w-0 border-l border-border/60 bg-muted/20 xl:flex xl:flex-[5_0_0%]">
              <div className="h-full w-full overflow-hidden">
                <ResumePreviewPanel />
              </div>
            </div>

            {/* ── Panel 3: Designer ── */}
            <aside className="hidden min-w-0 border-l border-border/60 bg-background xl:flex xl:flex-[4_0_0%] xl:flex-col">
              <DesignerPanel />
            </aside>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
