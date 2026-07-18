'use client';

import { Check, LayoutTemplate } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { CleanResumeView } from '@/app/u/[handle]/views/clean-resume-view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  buildDesignForTemplateSwitch,
  getAllResumeTemplates,
  getResumeTemplate,
  type ResumeTemplateId,
} from '@/lib/resume/templates';
import { cn } from '@/lib/utils';
import type { PublicProfile, ResumeDesign } from '@/types';

import { ResumeTemplateLiveThumbnail } from './resume-template-live-thumbnail';

const RESUME_NATIVE_WIDTH_PX = 816;
/** Horizontal padding on each side of the gallery preview (matches px-5). */
const PREVIEW_HORIZONTAL_PADDING_PX = 40;

interface ResumeTemplateGalleryProps {
  profile: PublicProfile;
  currentDesign: ResumeDesign;
  currentTemplateId: ResumeTemplateId;
  onSelect: (design: ResumeDesign) => void;
  /** Optional custom trigger. Defaults to "Browse all templates". */
  children?: React.ReactNode;
}

/**
 * Scaled live resume preview for the gallery's right pane.
 * Fits the available width and scrolls vertically — like the builder preview,
 * sized down to the clay overlay.
 */
function GalleryResumePreview({
  profile,
  design,
}: {
  profile: PublicProfile;
  design: ResumeDesign;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const previewProfile = useMemo(
    () => ({ ...profile, resumeDesign: design }) as PublicProfile,
    [profile, design]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      // Reserve equal left/right padding so the sheet doesn't hug the edge.
      const available = el.clientWidth - PREVIEW_HORIZONTAL_PADDING_PX * 2;
      if (available > 0) setScale(Math.min(available / RESUME_NATIVE_WIDTH_PX, 1));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sheetWidth = RESUME_NATIVE_WIDTH_PX * scale;

  return (
    <div ref={containerRef} className="h-full w-full overflow-y-auto overflow-x-hidden px-5 py-5">
      {scale > 0 ? (
        <div className="mx-auto" style={{ width: sheetWidth }}>
          <div className="overflow-hidden rounded-md border border-border/50 bg-white shadow-sm">
            <div
              className="pointer-events-none origin-top-left select-none [&_.resume-actions]:hidden"
              style={{ zoom: scale }}
            >
              <CleanResumeView profile={previewProfile} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto h-full max-w-sm animate-pulse rounded-md bg-muted/40" />
      )}
    </div>
  );
}

/**
 * Full-size clay overlay for browsing resume templates.
 *
 * Left: scrollable 3-up thumbnail grid (same card size as the Design panel).
 * Right: live resume preview of the selected template.
 */
export function ResumeTemplateGallery({
  profile,
  currentDesign,
  currentTemplateId,
  onSelect,
  children,
}: ResumeTemplateGalleryProps) {
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<ResumeTemplateId>(currentTemplateId);
  const templates = getAllResumeTemplates();

  const previewDesign = useMemo(
    () => buildDesignForTemplateSwitch(currentDesign, previewId),
    [currentDesign, previewId]
  );
  const previewMeta = getResumeTemplate(previewId);
  const dirty = previewId !== currentTemplateId;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setPreviewId(currentTemplateId);
  };

  const handleApply = () => {
    if (!dirty) {
      setOpen(false);
      return;
    }
    onSelect(previewDesign);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs">
            <LayoutTemplate className="h-3.5 w-3.5" />
            Browse all templates
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="flex h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            Preview every layout with your content. Switching only changes the design — your
            experience, education, and skills stay put.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {/* Left: 3-up thumbnail grid — scrolls as more templates are added */}
          <div className="min-h-0 w-[min(100%,42rem)] shrink-0 overflow-y-auto border-r border-border/60 px-6 py-6">
            <div className="grid grid-cols-3 gap-x-6 gap-y-8">
              {templates.map((template) => {
                const isCurrent = currentTemplateId === template.id;
                const isPreview = previewId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setPreviewId(template.id)}
                    aria-pressed={isPreview}
                    aria-label={`Preview ${template.name} template`}
                    title={template.description}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      isPreview
                        ? 'border-foreground ring-1 ring-foreground'
                        : 'border-border/70 hover:border-foreground/25'
                    )}
                  >
                    {isPreview && (
                      <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    {isCurrent && !isPreview && (
                      <span className="absolute left-2 top-2 z-10 rounded-full bg-background/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur">
                        Current
                      </span>
                    )}

                    <ResumeTemplateLiveThumbnail
                      profile={profile}
                      templateId={template.id}
                      currentDesign={currentDesign}
                      className="rounded-none border-0 shadow-none"
                    />
                    <span
                      className={cn(
                        'truncate px-2 py-2 text-center text-xs font-medium leading-none',
                        isPreview ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {template.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: live resume preview of the selected template */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/20">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{previewMeta.name}</p>
                <p className="truncate text-xs text-muted-foreground">{previewMeta.description}</p>
              </div>
              {previewId === currentTemplateId && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Current
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <GalleryResumePreview profile={profile} design={previewDesign} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-3">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply} disabled={!dirty}>
            Apply template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
