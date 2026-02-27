'use client';

import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { AllSectionsEditor } from './components/all-sections-editor';
import {
  BuilderStoreProvider,
  useBuilderStore,
  useBuilderTemporal,
} from './components/builder-store-provider';
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
    </BuilderStoreProvider>
  );
}

// ──────────────────────────────────────────────
// Undo/Redo toolbar (needs to be inside the provider)
// ──────────────────────────────────────────────

function UndoRedoToolbar() {
  const undo = useBuilderTemporal((s) => s.undo);
  const redo = useBuilderTemporal((s) => s.redo);
  const pastLength = useBuilderTemporal((s) => s.pastStates.length);
  const futureLength = useBuilderTemporal((s) => s.futureStates.length);

  const canUndo = pastLength > 0;
  const canRedo = futureLength > 0;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => undo()}
            disabled={!canUndo}
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Undo {canUndo && <span className="text-muted-foreground">({pastLength})</span>}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => redo()}
            disabled={!canRedo}
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Redo {canRedo && <span className="text-muted-foreground">({futureLength})</span>}</p>
        </TooltipContent>
      </Tooltip>
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
  // Keep sections in sync with the zustand store so the preview stays up-to-date
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const storeSections = useBuilderStore((s) => s.draftProfile.sections);

  useEffect(() => {
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
  }, [sections, storeSections, commitInlineChange]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] gap-3 bg-muted/40 p-3">
      <TooltipProvider delayDuration={300}>
        {/* Editor — All sections stacked vertically, grows with content */}
        <main className="flex min-w-0 flex-1 flex-col rounded-xl bg-background shadow-sm">
          {/* Editor header */}
          <div className="sticky top-3 z-10 flex h-11 shrink-0 items-center justify-between rounded-t-xl border-b bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Editor
            </span>
            <UndoRedoToolbar />
          </div>

          {/* Section editors — expand naturally, no inner scroll */}
          <div className="min-h-[60vh] flex-1">
            <div className="mx-auto max-w-3xl px-5 py-6">
              <AllSectionsEditor />
            </div>
          </div>
        </main>

        {/* Resume Preview Panel — sticky so it stays visible while scrolling */}
        <aside className="hidden min-w-0 flex-1 xl:block">
          <div className="sticky top-3 h-[calc(100vh-3.5rem-1.5rem)] overflow-hidden rounded-xl bg-background shadow-sm">
            <ResumePreviewPanel />
          </div>
        </aside>
      </TooltipProvider>
    </div>
  );
}
