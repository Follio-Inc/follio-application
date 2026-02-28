'use client';

import { Suspense, useEffect, useState } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';

import { AllSectionsEditor } from './components/all-sections-editor';
import { BuilderStoreProvider, useBuilderStore } from './components/builder-store-provider';
import { BuilderToolbar } from './components/builder-toolbar';
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted/30">
      <TooltipProvider delayDuration={300}>
        {/* Toolbar — spans full width, sticks to top of the scroll container */}
        <div className="sticky top-0 z-20 border-b border-border/40 bg-muted/50 backdrop-blur-sm">
          <BuilderToolbar />
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Editor — All sections stacked vertically, grows with content */}
          <main className="flex min-w-0 flex-[4] flex-col bg-muted/50">
            {/* Section editors — expand naturally, no inner scroll */}
            <div className="min-h-[60vh] flex-1">
              <div className="flat-cards mx-auto max-w-3xl px-5 py-6">
                <AllSectionsEditor />
              </div>
            </div>
          </main>

          {/* Resume Preview Panel — sticky, height accounts for topbar + toolbar */}
          <aside className="hidden min-w-0 flex-[5] border-l border-border/40 bg-muted/20 xl:block">
            <div className="sticky top-0 h-[calc(100vh-3.5rem)] overflow-hidden">
              <ResumePreviewPanel />
            </div>
          </aside>
        </div>
      </TooltipProvider>
    </div>
  );
}
