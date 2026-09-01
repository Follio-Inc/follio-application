'use client';

import {
  ArrowLeft,
  Check,
  CloudUpload,
  ExternalLink,
  Loader2,
  RotateCcw,
  WandSparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  PREVIEW_DRAFT,
  PREVIEW_SCROLL_TO_SECTION,
  isPreviewReadyMessage,
  isPreviewSectionClickMessage,
  type PreviewDraftMessage,
  type PreviewScrollToSectionMessage,
} from '@/lib/portfolio/preview-messages';
import { cn } from '@/lib/utils';

import {
  PortfolioEditorSidebar,
  PortfolioMobileBar,
  PortfolioMobileDesignDialog,
} from './portfolio-editor-sidebar';
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

interface PortfolioEditorClientProps {
  handle: string;
  publishedPlan: TemplatePortfolio;
  initialDraft: TemplatePortfolio;
  currentTemplateId: string;
  templates: TemplateOption[];
  templatesById: Record<string, EditorTemplateInfo>;
  template: EditorTemplateInfo;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type MobileView = 'editor' | 'preview';
type EditorTab = 'content' | 'design';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function PortfolioEditorClient({
  handle,
  publishedPlan,
  initialDraft,
  currentTemplateId,
  templates,
  templatesById,
  template,
}: PortfolioEditorClientProps) {
  const [draft, setDraft] = useState<TemplatePortfolio>(initialDraft);
  const [published, setPublished] = useState<TemplatePortfolio>(publishedPlan);
  const [activeTemplateId, setActiveTemplateId] = useState(currentTemplateId);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [publishing, setPublishing] = useState(false);
  const [publishedToast, setPublishedToast] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const [editorTab, setEditorTab] = useState<EditorTab>('content');
  const [mobileDesignOpen, setMobileDesignOpen] = useState(false);
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);

  const isFirstRender = useRef(true);
  const skipNextAutosave = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewReadyRef = useRef(false);

  const activeTemplate = templatesById[activeTemplateId] ?? template;
  const content = draft.content!;

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published]
  );

  const emptyByType = useMemo(
    () => computeEmptySections(content, draft.copy),
    [content, draft.copy]
  );

  const save = useCallback(async (next: TemplatePortfolio) => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/portfolio/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: next }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, []);

  const pushDraftToPreview = useCallback((next: TemplatePortfolio) => {
    const frame = previewFrameRef.current;
    if (!frame?.contentWindow || !previewReadyRef.current) return;
    const message: PreviewDraftMessage = { type: PREVIEW_DRAFT, draft: next };
    frame.contentWindow.postMessage(message, window.location.origin);
  }, []);

  const pushScrollToPreview = useCallback((sectionId: string) => {
    const frame = previewFrameRef.current;
    if (!frame?.contentWindow || !previewReadyRef.current) return;
    const message: PreviewScrollToSectionMessage = {
      type: PREVIEW_SCROLL_TO_SECTION,
      sectionId,
    };
    frame.contentWindow.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (isPreviewReadyMessage(event.data)) {
        previewReadyRef.current = true;
        pushDraftToPreview(draft);
        return;
      }
      if (isPreviewSectionClickMessage(event.data)) {
        setMobileView('editor');
        setFocusSectionId(event.data.sectionId);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [draft, pushDraftToPreview]);

  useEffect(() => {
    pushDraftToPreview(draft);
  }, [draft, pushDraftToPreview]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    setSaveStatus('saving');
    const timer = setTimeout(() => void save(draft), 700);
    return () => clearTimeout(timer);
  }, [draft, save]);

  const handleTemplateApplied = useCallback((plan: TemplatePortfolio) => {
    const next = clone(plan);
    skipNextAutosave.current = true;
    setDraft(next);
    setPublished(next);
    setActiveTemplateId(plan.templateId);
    setSaveStatus('saved');
  }, []);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      const res = await fetch('/api/portfolio/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      if (!res.ok) throw new Error('publish failed');
      setPublished(clone(draft));
      setSaveStatus('saved');
      setPublishedToast(true);
      setTimeout(() => setPublishedToast(false), 2500);
    } catch {
      setSaveStatus('error');
    } finally {
      setPublishing(false);
    }
  }, [draft]);

  const handleDiscard = useCallback(() => {
    setDraft(clone(published));
  }, [published]);

  const onSections = useCallback(
    (sections: TemplateSectionConfig[]) => setDraft((d) => ({ ...d, sections })),
    []
  );
  const onCopy = useCallback(
    (patch: Partial<TemplateCopy>) => setDraft((d) => ({ ...d, copy: { ...d.copy, ...patch } })),
    []
  );
  const onStyle = useCallback(
    (patch: Partial<TemplateStyleConfig>) =>
      setDraft((d) => ({ ...d, style: { ...d.style, ...patch } })),
    []
  );
  const onOverrides = useCallback(
    (next: TemplatePortfolioOverrides) => setDraft((d) => ({ ...d, overrides: next })),
    []
  );
  const onContent = useCallback(
    (next: TemplateProfileData) => setDraft((d) => ({ ...d, content: next })),
    []
  );

  const showMobilePreview = mobileView === 'preview';

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col bg-muted/30">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {showMobilePreview ? (
            <Button variant="ghost" size="sm" onClick={() => setMobileView('editor')}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Editor
            </Button>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
          )}
          <div className="hidden min-w-0 sm:block">
            <span className="text-eyebrow">Portfolio</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {activeTemplate.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator status={saveStatus} dirty={dirty} />
          {dirty && !showMobilePreview && (
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={publishing}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Discard</span>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/u/${handle}/work`} target="_blank">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">View live</span>
            </Link>
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={!dirty || publishing}>
            {publishing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : publishedToast ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <CloudUpload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {publishedToast ? 'Published' : 'Publish'}
          </Button>
        </div>
      </header>

      {/* Body — sidebar + preview share one row; no wrapper between them */}
      <div className="relative flex min-h-0 w-full flex-1">
        <PortfolioEditorSidebar
          className={cn(showMobilePreview ? 'hidden md:flex' : 'flex', 'pb-16 md:pb-0')}
          draft={draft}
          content={content}
          template={activeTemplate}
          templates={templates}
          activeTemplateId={activeTemplateId}
          emptyByType={emptyByType}
          saveStatus={saveStatus}
          dirty={dirty}
          tab={editorTab}
          onTabChange={setEditorTab}
          onTemplateApplied={handleTemplateApplied}
          onSections={onSections}
          onCopy={onCopy}
          onStyle={onStyle}
          onOverrides={onOverrides}
          onContent={onContent}
          focusSectionId={focusSectionId}
          onFocusSectionHandled={() => setFocusSectionId(null)}
          onScrollPreviewToSection={pushScrollToPreview}
        />

        {/* Live preview */}
        <div
          className={cn(
            'relative min-h-0 min-w-0 flex-col bg-muted/20',
            showMobilePreview ? 'flex flex-1 pb-16 md:pb-0' : 'hidden md:flex md:flex-1'
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-6">
            <span className="text-eyebrow">Preview</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Click a section to edit
            </span>
          </div>
          <iframe
            ref={previewFrameRef}
            src="/portfolio-preview"
            title="Portfolio preview"
            className="min-h-0 flex-1 border-0"
          />
        </div>

        {!showMobilePreview ? (
          <PortfolioMobileBar
            onOpenPreview={() => setMobileView('preview')}
            onOpenDesign={() => setEditorTab('design')}
          />
        ) : (
          <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border/60 bg-background/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 gap-2"
              onClick={() => setMobileView('editor')}
            >
              <ArrowLeft className="h-4 w-4" />
              Editor
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 gap-2"
              onClick={() => setMobileDesignOpen(true)}
            >
              <WandSparkles className="h-4 w-4" />
              Design
            </Button>
          </div>
        )}

        <PortfolioMobileDesignDialog open={mobileDesignOpen} onOpenChange={setMobileDesignOpen}>
          <PortfolioDesignPanel
            draft={draft}
            template={activeTemplate}
            templates={templates}
            activeTemplateId={activeTemplateId}
            onTemplateApplied={(plan) => {
              handleTemplateApplied(plan);
              setMobileDesignOpen(false);
            }}
            onCopy={onCopy}
            onStyle={onStyle}
          />
        </PortfolioMobileDesignDialog>
      </div>
    </div>
  );
}

function SaveIndicator({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Saving draft
      </span>
    );
  }
  if (status === 'saved' && !dirty) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        <Check className="h-3 w-3" aria-hidden />
        Draft saved
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        className="text-xs font-medium text-amber-600 dark:text-amber-500"
        role="status"
        title="Draft is saved. Publish to update your live site."
      >
        Unpublished changes
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-xs text-destructive" role="status">
        Couldn&apos;t save
      </span>
    );
  }
  return null;
}

function computeEmptySections(
  profile: TemplateProfileData,
  copy: TemplateCopy
): Partial<Record<string, boolean>> {
  const visibleProjects = profile.projects.filter((p) => p.isVisible && p.showOnPortfolio);
  return {
    hero: false,
    projects: visibleProjects.length === 0,
    about: !(copy.aboutText || profile.summary),
    experience: profile.workExperiences.filter((e) => e.isVisible).length === 0,
    skills:
      profile.skills.filter((s) => s.isVisible).length === 0 && profile.skillGroups.length === 0,
    education: profile.educations.filter((e) => e.isVisible).length === 0,
    certifications: profile.certifications.filter((c) => c.isVisible).length === 0,
    awards: profile.awards.filter((a) => a.isVisible).length === 0,
    github: !profile.github,
    blog: profile.blogPosts.filter((b) => b.isVisible).length === 0,
    contact: false,
  };
}
