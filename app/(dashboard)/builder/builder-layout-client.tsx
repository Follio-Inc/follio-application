'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { DocumentBuilderShell } from '@/components/document-builder/document-builder-shell';
import { cn } from '@/lib/utils';

import { AiEditReviewProvider } from './components/ai-edit/ai-edit-review';
import { AllSectionsEditor } from './components/all-sections-editor';
import { BuilderContentHeader } from './components/builder-content-header';
import { BuilderMobileBar } from './components/builder-mobile-bar';
import { BuilderStoreProvider, useBuilderStore } from './components/builder-store-provider';
import { ResumePreviewPanel } from './components/resume-preview-panel';

import type { FullProfile, ProfileSection } from '@/types';

// Designer panel is only visible when the user opens the Designer tab —
// load it on demand so the initial editor bundle stays small.
const DesignerPanel = dynamic(
  () => import('./components/designer-panel').then((m) => ({ default: m.DesignerPanel })),
  { ssr: false }
);

// AI edit panel only opens from the content header — load it on demand.
const AiEditPanel = dynamic(
  () => import('./components/ai-edit/ai-edit-panel').then((m) => ({ default: m.AiEditPanel })),
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
// Inner layout (inside the store provider)
// ──────────────────────────────────────────────

interface BuilderLayoutInnerProps {
  sections: ProfileSection[];
}

function BuilderLayoutInner({ sections }: BuilderLayoutInnerProps) {
  const commitInlineChange = useBuilderStore((s) => s.commitInlineChange);
  const storeSections = useBuilderStore((s) => s.draftProfile.sections);
  const profileId = useBuilderStore((s) => s.draftProfile.id);
  const [aiOpen, setAiOpen] = useState(false);
  // Section editors copy values into local state; remount them after AI edits change the resume.
  const [editorVersion, setEditorVersion] = useState(0);
  const reloadEditors = useCallback(() => setEditorVersion((version) => version + 1), []);

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
    <AiEditReviewProvider active={aiOpen} onResumeChanged={reloadEditors}>
      <DocumentBuilderShell
        content={
          <>
            <BuilderContentHeader aiOpen={aiOpen} onToggleAi={() => setAiOpen((open) => !open)} />
            <div className="min-h-[60vh] flex-1 pb-24 xl:pb-10">
              {/* The editor stays mounted while AI edit is open so inline state survives. */}
              <div
                className={cn(
                  'flat-cards mx-auto max-w-2xl px-6 py-10 sm:px-8',
                  aiOpen && 'hidden'
                )}
              >
                <AllSectionsEditor key={editorVersion} />
              </div>
              {aiOpen && (
                <div className="mx-auto max-w-2xl px-6 py-10 sm:px-8">
                  <AiEditPanel key={profileId} onClose={() => setAiOpen(false)} />
                </div>
              )}
            </div>
          </>
        }
        preview={<ResumePreviewPanel />}
        designer={<DesignerPanel />}
        mobileBar={<BuilderMobileBar />}
      />
    </AiEditReviewProvider>
  );
}
