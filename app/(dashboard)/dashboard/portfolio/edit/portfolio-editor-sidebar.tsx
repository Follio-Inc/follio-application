'use client';

import { Eye, PenLine, WandSparkles, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { PortfolioContentEditor } from './portfolio-content-editor';
import { PortfolioDesignPanel } from './portfolio-design-panel';

import type { TemplateOption } from '@/components/portfolio/template-option-card';
import type { EditorTemplateInfo } from './types';
import type {
  TemplateCopy,
  TemplatePortfolio,
  TemplatePortfolioOverrides,
  TemplateProfileData,
  TemplateSectionConfig,
  TemplateStyleConfig,
} from '@/lib/portfolio/templates/types';

type EditorTab = 'content' | 'design';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PortfolioEditorSidebarProps {
  draft: TemplatePortfolio;
  content: TemplateProfileData;
  template: EditorTemplateInfo;
  templates: TemplateOption[];
  activeTemplateId: string;
  emptyByType: Partial<Record<string, boolean>>;
  saveStatus: SaveStatus;
  dirty: boolean;
  onTemplateApplied: (plan: TemplatePortfolio) => void;
  onSections: (sections: TemplateSectionConfig[]) => void;
  onCopy: (patch: Partial<TemplateCopy>) => void;
  onStyle: (patch: Partial<TemplateStyleConfig>) => void;
  onOverrides: (next: TemplatePortfolioOverrides) => void;
  onContent: (next: TemplateProfileData) => void;
  focusSectionId?: string | null;
  onFocusSectionHandled?: () => void;
  /** Scroll the live preview iframe to a section (editor-driven navigation). */
  onScrollPreviewToSection?: (sectionId: string) => void;
  /** Controlled tab — used when mobile Design opens the design panel. */
  tab?: EditorTab;
  onTabChange?: (tab: EditorTab) => void;
  className?: string;
}

export function PortfolioEditorSidebar({
  draft,
  content,
  template,
  templates,
  activeTemplateId,
  emptyByType,
  saveStatus,
  dirty,
  onTemplateApplied,
  onSections,
  onCopy,
  onStyle,
  onOverrides,
  onContent,
  focusSectionId,
  onFocusSectionHandled,
  onScrollPreviewToSection,
  tab: controlledTab,
  onTabChange,
  className,
}: PortfolioEditorSidebarProps) {
  const [internalTab, setInternalTab] = useState<EditorTab>('content');
  const tab = controlledTab ?? internalTab;
  const setTab = (next: EditorTab) => {
    onTabChange?.(next);
    if (controlledTab === undefined) setInternalTab(next);
  };

  useEffect(() => {
    if (!focusSectionId) return;
    onTabChange?.('content');
    if (controlledTab === undefined) setInternalTab('content');
  }, [focusSectionId, controlledTab, onTabChange]);

  return (
    <aside
      className={cn(
        'flex h-full w-full shrink-0 flex-col bg-background md:w-[420px] md:border-r md:border-border/60',
        className
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
        <div
          className="flex min-w-0 flex-1 rounded-lg bg-muted/50 p-0.5"
          role="tablist"
          aria-label="Editor mode"
        >
          <EditorTabButton
            active={tab === 'content'}
            icon={PenLine}
            label="Content"
            onClick={() => setTab('content')}
          />
          <EditorTabButton
            active={tab === 'design'}
            icon={WandSparkles}
            label="Design"
            onClick={() => setTab('design')}
          />
        </div>
        <SidebarSaveHint status={saveStatus} dirty={dirty} />
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {tab === 'content' ? (
          <PortfolioContentEditor
            draft={draft}
            content={content}
            template={template}
            emptyByType={emptyByType}
            focusSectionId={focusSectionId}
            onFocusSectionHandled={onFocusSectionHandled}
            onScrollPreviewToSection={onScrollPreviewToSection}
            onSections={onSections}
            onCopy={onCopy}
            onOverrides={onOverrides}
            onContent={onContent}
          />
        ) : (
          <PortfolioDesignPanel
            draft={draft}
            template={template}
            templates={templates}
            activeTemplateId={activeTemplateId}
            onTemplateApplied={onTemplateApplied}
            onCopy={onCopy}
            onStyle={onStyle}
          />
        )}
      </div>
    </aside>
  );
}

function SidebarSaveHint({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status === 'saving') {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground" role="status" aria-live="polite">
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-500"
        role="status"
        aria-live="polite"
        title="Draft is saved. Publish to update your live site."
      >
        Unpublished
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground" role="status" aria-live="polite">
        Draft saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="shrink-0 text-[11px] text-destructive" role="status" aria-live="polite">
        Save failed
      </span>
    );
  }
  return null;
}

function EditorTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      {label}
    </button>
  );
}

/** Fixed bottom bar on small screens — Preview + Design, matching resume builder. */
export function PortfolioMobileBar({
  onOpenPreview,
  onOpenDesign,
}: {
  onOpenPreview: () => void;
  onOpenDesign: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border/60 bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <Button type="button" variant="outline" className="h-10 flex-1 gap-2" onClick={onOpenPreview}>
        <Eye className="h-4 w-4" />
        Preview
      </Button>
      <Button type="button" variant="outline" className="h-10 flex-1 gap-2" onClick={onOpenDesign}>
        <WandSparkles className="h-4 w-4" />
        Design
      </Button>
    </div>
  );
}

/** Full-screen design dialog for mobile when the sidebar is replaced by preview. */
export function PortfolioMobileDesignDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0 md:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Portfolio design</DialogTitle>
          <DialogDescription>Customize template, theme, and SEO</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
