'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef } from 'react';

import { DocumentBuilderShell } from '@/components/document-builder/document-builder-shell';

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
    <DocumentBuilderShell
      contentClassName="bg-muted/40"
      content={
        <>
          <BuilderContentHeader />
          <div className="min-h-[60vh] flex-1 pb-20 xl:pb-8">
            <div className="flat-cards mx-auto max-w-3xl px-6 py-8">
              <AllSectionsEditor />
            </div>
          </div>
        </>
      }
      preview={<ResumePreviewPanel />}
      designer={<DesignerPanel />}
      mobileBar={<BuilderMobileBar />}
    />
  );
}
