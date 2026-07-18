'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';

import {
  PREVIEW_SECTION_CLICK,
  type PreviewSectionClickMessage,
} from '@/lib/portfolio/preview-messages';
import { cn } from '@/lib/utils';

import type { TemplateSectionType } from './templates/types';

const PortfolioEditorPreviewContext = createContext(false);

/** Marks the preview iframe tree so sections can become click-to-edit targets. */
export function PortfolioEditorPreviewProvider({ children }: { children: ReactNode }) {
  return (
    <PortfolioEditorPreviewContext.Provider value={true}>
      {children}
    </PortfolioEditorPreviewContext.Provider>
  );
}

function usePortfolioEditorPreview() {
  return useContext(PortfolioEditorPreviewContext);
}

const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, [role="button"], [contenteditable="true"]';

interface PreviewEditableSectionProps {
  sectionId: string;
  sectionType: TemplateSectionType;
  children: ReactNode;
}

/**
 * Wraps a portfolio section in the editor preview iframe.
 * Clicking non-interactive areas posts a message to the parent editor.
 */
export function PreviewEditableSection({
  sectionId,
  sectionType,
  children,
}: PreviewEditableSectionProps) {
  const isEditorPreview = usePortfolioEditorPreview();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!isEditorPreview) return;

      const target = event.target as HTMLElement;
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      const message: PreviewSectionClickMessage = {
        type: PREVIEW_SECTION_CLICK,
        sectionId,
        sectionType,
      };
      window.parent?.postMessage(message, window.location.origin);
    },
    [isEditorPreview, sectionId, sectionType]
  );

  if (!isEditorPreview) {
    return <>{children}</>;
  }

  return (
    <div
      data-portfolio-section-id={sectionId}
      data-portfolio-section-type={sectionType}
      onClick={handleClick}
      className={cn(
        'group/preview-section relative scroll-mt-24',
        'cursor-pointer transition-[box-shadow] duration-200',
        'hover:ring-2 hover:ring-inset hover:ring-primary/35'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute left-3 top-3 z-20 opacity-0 transition-opacity duration-200',
          'group-hover/preview-section:opacity-100'
        )}
      >
        <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground shadow-sm">
          Edit section
        </span>
      </div>
      {children}
    </div>
  );
}
