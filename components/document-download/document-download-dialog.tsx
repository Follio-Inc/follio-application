'use client';

import { Download, Loader2, Share2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useDocumentDownload } from '@/lib/hooks/use-document-download';
import {
  getAllowedPdfLayouts,
  isPagedPageLayout,
  type PdfLayout,
  type DocumentPageLayout,
} from '@/lib/document-design';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────

/** Re-export for callers that imported PdfLayout from this module. */
export type { PdfLayout };

interface LayoutOption {
  value: PdfLayout;
  label: string;
  description: string;
}

export interface DocumentDownloadDialogProps {
  /** Absolute PDF API path, e.g. `/api/export/jdoe/pdf` or `/api/cover-letters/id/pdf`. */
  pdfPath: string;
  /** Download filename without `.pdf`. */
  filename: string;
  /**
   * Live document page layout. Continuous → all three download options;
   * A4/Letter → A4 and Letter only.
   */
  pageLayout?: DocumentPageLayout;
  /** Forward `token`/`key` search params (resume unlisted visitors). */
  forwardSearchParams?: boolean;
  /** Dialog description — document-type specific copy. */
  description?: string;
  /** Optional share banner body copy. Requires `onShareClick`. */
  shareBannerText?: string;
  /** Called when the user clicks the share button in the banner. */
  onShareClick?: () => void;
  /** Controlled open state. When provided, the built-in trigger is hidden. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Show the built-in toolbar trigger in uncontrolled mode. Default true. */
  showTrigger?: boolean;
}

// ─── Illustrations ──────────────────────────────────────────────────

/** Visual preview: a single tall document with flowing content lines. */
function ContinuousIllustration({ selected }: { selected: boolean }) {
  const lineColor = selected ? 'stroke-primary/60' : 'stroke-muted-foreground/40';
  const pageFill = selected ? 'fill-primary/5' : 'fill-muted/50';
  const pageBorder = selected ? 'stroke-primary/30' : 'stroke-border';

  return (
    <svg viewBox="0 0 80 120" className="h-full w-full" aria-hidden="true">
      {/* Page */}
      <rect
        x="8"
        y="4"
        width="64"
        height="112"
        rx="3"
        className={cn(pageFill, pageBorder)}
        strokeWidth="1.5"
        fill="currentColor"
      />
      {/* Header block */}
      <rect
        x="18"
        y="14"
        width="30"
        height="4"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.7"
      />
      <rect
        x="18"
        y="22"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.4"
      />
      {/* Content lines flowing continuously */}
      <rect
        x="18"
        y="32"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="38"
        width="38"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="44"
        width="42"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="50"
        width="36"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="56"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="62"
        width="30"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="68"
        width="40"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="74"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="80"
        width="34"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="86"
        width="42"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="92"
        width="28"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="98"
        width="38"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="104"
        width="20"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}

/** Visual preview: two stacked A4 pages with a visible gap / page break. */
function PagedIllustration({ selected }: { selected: boolean }) {
  const lineColor = selected ? 'stroke-primary/60' : 'stroke-muted-foreground/40';
  const pageFill = selected ? 'fill-primary/5' : 'fill-muted/50';
  const pageBorder = selected ? 'stroke-primary/30' : 'stroke-border';

  return (
    <svg viewBox="0 0 80 120" className="h-full w-full" aria-hidden="true">
      {/* Page 1 */}
      <rect
        x="8"
        y="4"
        width="64"
        height="52"
        rx="3"
        className={cn(pageFill, pageBorder)}
        strokeWidth="1.5"
        fill="currentColor"
      />
      {/* Page 1 header */}
      <rect
        x="18"
        y="12"
        width="28"
        height="4"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.7"
      />
      <rect
        x="18"
        y="20"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.4"
      />
      {/* Page 1 content */}
      <rect
        x="18"
        y="28"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="34"
        width="38"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="40"
        width="42"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="46"
        width="30"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.3"
      />

      {/* Gap between pages — dashed line to indicate page break */}
      <line
        x1="12"
        y1="60"
        x2="68"
        y2="60"
        className={cn(lineColor)}
        strokeWidth="1"
        strokeDasharray="3 2"
      />

      {/* Page 2 */}
      <rect
        x="8"
        y="64"
        width="64"
        height="52"
        rx="3"
        className={cn(pageFill, pageBorder)}
        strokeWidth="1.5"
        fill="currentColor"
      />
      {/* Page 2 content */}
      <rect
        x="18"
        y="74"
        width="44"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="80"
        width="36"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="86"
        width="42"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="92"
        width="38"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="98"
        width="28"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="18"
        y="104"
        width="20"
        height="2"
        rx="1"
        className={cn(lineColor)}
        strokeWidth="0"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}

// ─── Constants ──────────────────────────────────────────────────────

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    value: 'continuous',
    label: 'Continuous',
    description: 'Single scrollable page with no breaks — best for digital viewing.',
  },
  {
    value: 'a4',
    label: 'A4',
    description: 'Standard A4 pages with page breaks — common outside the US.',
  },
  {
    value: 'letter',
    label: 'Letter',
    description: 'US Letter pages with page breaks — common in North America.',
  },
];

const DEFAULT_LAYOUT: PdfLayout = 'continuous';

// ─── Component ──────────────────────────────────────────────────────

export function DocumentDownloadDialog({
  pdfPath,
  filename,
  pageLayout = DEFAULT_LAYOUT,
  forwardSearchParams = false,
  description,
  shareBannerText,
  onShareClick,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  showTrigger = true,
}: DocumentDownloadDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const allowedLayouts = useMemo(() => getAllowedPdfLayouts(pageLayout), [pageLayout]);
  const visibleOptions = useMemo(
    () => LAYOUT_OPTIONS.filter((option) => allowedLayouts.includes(option.value)),
    [allowedLayouts]
  );
  const optionCount = visibleOptions.length;
  const pagedOnly = isPagedPageLayout(pageLayout);

  const [layout, setLayout] = useState<PdfLayout>(() =>
    allowedLayouts.includes(pageLayout) ? pageLayout : (allowedLayouts[0] ?? DEFAULT_LAYOUT)
  );

  useEffect(() => {
    if (!allowedLayouts.includes(layout)) {
      setLayout(allowedLayouts[0] ?? DEFAULT_LAYOUT);
    }
  }, [allowedLayouts, layout]);

  useEffect(() => {
    if (allowedLayouts.includes(pageLayout)) {
      setLayout(pageLayout);
    }
  }, [pageLayout, allowedLayouts]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const { download, isDownloading } = useDocumentDownload({
    pdfPath,
    filename,
    layout,
    forwardSearchParams,
    onError: (err) => setError(err.message || 'Download failed. Please try again.'),
  });

  const startDownload = () => {
    setError(null);
    void download(layout);
  };

  const resolvedDescription =
    description ??
    (pagedOnly
      ? 'Your document uses print pages — choose A4 or Letter, then download.'
      : 'Choose a layout, then download your PDF.');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Built-in trigger — only rendered in uncontrolled mode */}
      {!isControlled && showTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Download as PDF
          </TooltipContent>
        </Tooltip>
      )}

      <DialogContent className={cn('sm:max-w-2xl', optionCount >= 3 && 'sm:max-w-3xl')}>
        <DialogHeader>
          <DialogTitle>Download PDF</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        {/* ── Share banner (only shown when a share callback is provided) ── */}
        {onShareClick && shareBannerText && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm text-muted-foreground">{shareBannerText}</p>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => {
                setOpen(false);
                onShareClick();
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        )}

        {/* ── Layout cards (gated by resume page layout) ── */}
        <div
          className={cn(
            'mt-4 grid gap-4',
            optionCount >= 3 ? 'grid-cols-3' : optionCount === 2 ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {visibleOptions.map((option) => {
            const selected = layout === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setLayout(option.value)}
                disabled={isDownloading}
                aria-pressed={selected}
                className={cn(
                  'group flex flex-col items-center rounded-xl border-2 p-4 text-center transition-all disabled:opacity-60',
                  selected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40',
                  optionCount === 1 && 'mx-auto w-full max-w-xs'
                )}
              >
                {/* Illustration */}
                <div className="mb-4 h-32 w-24">
                  {option.value === 'continuous' ? (
                    <ContinuousIllustration selected={selected} />
                  ) : (
                    <PagedIllustration selected={selected} />
                  )}
                </div>

                {/* Label */}
                <p
                  className={cn(
                    'text-sm font-semibold',
                    selected ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {option.label}
                </p>

                {/* Description */}
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : isDownloading ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            Generating your PDF — it will appear in your downloads shortly. Large resumes can take
            up to a minute.
          </p>
        ) : null}

        {/* ── Download button ── */}
        <Button
          type="button"
          className="sticky bottom-0 mt-5 w-full"
          size="lg"
          onClick={startDownload}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
