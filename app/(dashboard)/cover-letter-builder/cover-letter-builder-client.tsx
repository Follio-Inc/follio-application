'use client';

import dynamic from 'next/dynamic';

import { DocumentBuilderShell } from '@/components/document-builder/document-builder-shell';

import { CoverLetterContentPanel } from './components/cover-letter-content-panel';
import { CoverLetterPreviewPanel } from './components/cover-letter-preview-panel';
import { CoverLetterStoreProvider, type CoverLetterDraft } from './cover-letter-store';

const CoverLetterDesignerPanel = dynamic(
  () =>
    import('./components/cover-letter-designer-panel').then((m) => ({
      default: m.CoverLetterDesignerPanel,
    })),
  { ssr: false }
);

interface CoverLetterBuilderClientProps {
  initial: CoverLetterDraft;
}

export function CoverLetterBuilderClient({ initial }: CoverLetterBuilderClientProps) {
  return (
    <CoverLetterStoreProvider initial={initial}>
      <DocumentBuilderShell
        contentClassName="bg-muted/40"
        content={<CoverLetterContentPanel />}
        preview={<CoverLetterPreviewPanel />}
        designer={<CoverLetterDesignerPanel />}
      />
    </CoverLetterStoreProvider>
  );
}
