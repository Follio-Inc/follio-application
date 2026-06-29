'use client';

import {
  ArrowLeft,
  Check,
  CloudUpload,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TemplateOption } from '@/components/portfolio/template-option-card';
import { Button } from '@/components/ui/button';
import {
  PREVIEW_DRAFT,
  isPreviewReadyMessage,
  type PreviewDraftMessage,
} from '@/lib/portfolio/preview-messages';

import { TemplateGallery } from '../../template-gallery';
import { SectionsAccordion } from './sections-accordion';

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
  profile: TemplateProfileData;
  currentTemplateId: string;
  templates: TemplateOption[];
  templatesById: Record<string, EditorTemplateInfo>;
  template: EditorTemplateInfo;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function PortfolioEditorClient({
  handle,
  publishedPlan,
  initialDraft,
  profile,
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

  const isFirstRender = useRef(true);
  const skipNextAutosave = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewReadyRef = useRef(false);

  const activeTemplate = templatesById[activeTemplateId] ?? template;

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published]
  );

  const emptyByType = useMemo(
    () => computeEmptySections(profile, draft.copy),
    [profile, draft.copy]
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

  // Stream the working draft into the preview iframe so edits appear instantly —
  // no reload, no blank flash. This is decoupled from the (debounced) network
  // save below, which only handles persistence.
  const pushDraftToPreview = useCallback((next: TemplatePortfolio) => {
    const frame = previewFrameRef.current;
    if (!frame?.contentWindow || !previewReadyRef.current) return;
    const message: PreviewDraftMessage = { type: PREVIEW_DRAFT, draft: next };
    frame.contentWindow.postMessage(message, window.location.origin);
  }, []);

  // When the iframe announces it's ready, send it the current draft. If it
  // reloads (e.g. dev HMR), it re-announces and we re-sync automatically.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (isPreviewReadyMessage(event.data)) {
        previewReadyRef.current = true;
        pushDraftToPreview(draft);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [draft, pushDraftToPreview]);

  // Real-time preview: push on every draft change immediately.
  useEffect(() => {
    pushDraftToPreview(draft);
  }, [draft, pushDraftToPreview]);

  // Debounced autosave of the working draft (persistence only).
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

  // ── Field updaters ────────────────────────────────────────────────
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
          <div className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-semibold">Edit portfolio</span>
            <span className="block truncate text-xs text-muted-foreground">
              {activeTemplate.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SaveIndicator status={saveStatus} />
          {dirty && (
            <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={publishing}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Discard</span>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/u/${handle}`} target="_blank">
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

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Controls — section-wise accordion (mirrors the resume builder) */}
        <div className="flex w-full shrink-0 flex-col border-b md:w-[400px] md:border-b-0 md:border-r">
          {templates.length > 1 && (
            <div className="shrink-0 border-b p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Template
              </p>
              <TemplateGallery
                templates={templates}
                currentTemplateId={activeTemplateId}
                onTemplateApplied={handleTemplateApplied}
              >
                <Button
                  variant="outline"
                  className="h-auto w-full justify-between gap-2 px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <LayoutTemplate className="h-4 w-4 shrink-0 text-muted-foreground" />
                    Change template
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {activeTemplate.name}
                  </span>
                </Button>
              </TemplateGallery>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <SectionsAccordion
              draft={draft}
              profile={profile}
              template={activeTemplate}
              emptyByType={emptyByType}
              onSections={onSections}
              onCopy={onCopy}
              onStyle={onStyle}
              onOverrides={onOverrides}
            />
          </div>
        </div>

        {/* Live preview */}
        <div className="relative min-h-[420px] flex-1 bg-muted/30">
          <iframe
            ref={previewFrameRef}
            src="/portfolio-preview"
            title="Portfolio preview"
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return <span className="text-xs text-destructive">Couldn&apos;t save</span>;
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
