'use client';

import { ChevronLeft, ChevronRight, PenLine, WandSparkles, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DEFAULT_BUILDER_VIEW_MODE,
  builderSideCollapseLabel,
  closeBuilderSide,
  escapeBuilderViewMode,
  isBuilderDesignerActive,
  isBuilderPreviewOnly,
  isContentEdgeTabVisible,
  isDesignEdgeTabVisible,
  openBuilderSide,
  type BuilderViewMode,
} from '@/lib/document-builder';
import { cn } from '@/lib/utils';

interface DocumentBuilderShellProps {
  content: ReactNode;
  preview: ReactNode;
  designer: ReactNode;
  /** Optional mobile bottom bar (resume / cover letter each supply their own). */
  mobileBar?: ReactNode;
  contentLabel?: string;
  designLabel?: string;
  /** Extra classes for the content pane (e.g. muted editor background). */
  contentClassName?: string;
  previewClassName?: string;
  designerClassName?: string;
}

/**
 * Shared 3-pane document builder shell (content | preview | designer).
 *
 * Desktop (xl+): Content+Preview XOR centered Preview XOR Preview+Design via
 * a constant-width slide canvas (transform only). Mutual exclusion is
 * enforced by BuilderViewMode — never both side panes. Resume and cover
 * letter compose this with their own panel content.
 */
export function DocumentBuilderShell({
  content,
  preview,
  designer,
  mobileBar,
  contentLabel = 'Content',
  designLabel = 'Design',
  contentClassName,
  previewClassName,
  designerClassName,
}: DocumentBuilderShellProps) {
  const [mode, setMode] = useState<BuilderViewMode>(DEFAULT_BUILDER_VIEW_MODE);

  const designerActive = isBuilderDesignerActive(mode);
  const previewOnly = isBuilderPreviewOnly(mode);

  const openDesign = useCallback(() => setMode((m) => openBuilderSide(m, 'designer')), []);
  const openContent = useCallback(() => setMode((m) => openBuilderSide(m, 'content')), []);
  const closeSide = useCallback(() => setMode((m) => closeBuilderSide(m)), []);

  useEffect(() => {
    if (!designerActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMode((m) => escapeBuilderViewMode(m));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [designerActive]);

  return (
    <div className="builder-base flex min-h-[calc(100vh-3.5rem)] flex-col xl:h-[calc(100vh-3.5rem)]">
      <TooltipProvider delayDuration={300}>
        <div className="relative flex-1 xl:min-h-0 xl:overflow-hidden">
          <div
            className="builder-slide flex h-full"
            data-designer-active={designerActive || undefined}
            data-preview-only={previewOnly || undefined}
          >
            {/* Content — full width on mobile; flex 4 on xl.
                Stay in the flex strip when preview-only (invisible gutters) so
                canvas width/preview size never change during mode transitions.
                Column uses builder-base; inner surface is the elevated panel. */}
            <div
              className={cn(
                'builder-base relative flex w-full min-w-0 flex-col xl:w-auto xl:flex-[4_0_0%]',
                previewOnly && 'xl:pointer-events-none xl:invisible',
                contentClassName
              )}
              aria-hidden={previewOnly || undefined}
              inert={previewOnly || undefined}
            >
              <div className="builder-panel flex min-h-0 flex-1 flex-col overflow-y-auto xl:m-2.5 xl:mr-2 xl:rounded-xl">
                {content}
              </div>
            </div>

            {/* Preview — xl only; always flex 5 so fit-zoom stays stable */}
            <div
              className={cn(
                'builder-base relative hidden min-w-0 xl:flex xl:flex-[5_0_0%]',
                previewClassName
              )}
            >
              <div
                className={cn(
                  'builder-panel relative flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden xl:my-2.5 xl:rounded-xl',
                  // Mirror Content/Designer outer insets when Preview sits on a screen edge
                  previewOnly && 'xl:mx-2.5',
                  mode === 'content' && 'xl:mr-2.5',
                  designerActive && 'xl:ml-2.5'
                )}
              >
                {mode !== 'preview' ? (
                  <BuilderSideCollapse mode={mode} onCollapse={closeSide} />
                ) : null}
                <div className="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
                  {preview}
                </div>
              </div>
            </div>

            {/* Designer — xl only; flex 4; invisible gutter in preview-only */}
            <div
              className={cn(
                'builder-base relative hidden min-w-0 xl:flex xl:flex-[4_0_0%] xl:flex-col',
                previewOnly && 'xl:pointer-events-none xl:invisible',
                designerClassName
              )}
              aria-hidden={previewOnly || undefined}
              inert={previewOnly || undefined}
            >
              <div className="builder-panel flex min-h-0 flex-1 flex-col overflow-hidden xl:m-2.5 xl:ml-2 xl:rounded-xl">
                {designer}
              </div>
            </div>
          </div>

          <BuilderEdgeTab
            side="right"
            label={designLabel}
            icon={WandSparkles}
            visible={isDesignEdgeTabVisible(mode)}
            onClick={openDesign}
            tooltip={`Show ${designLabel.toLowerCase()}`}
          />
          <BuilderEdgeTab
            side="left"
            label={contentLabel}
            icon={PenLine}
            visible={isContentEdgeTabVisible(mode)}
            onClick={openContent}
            tooltip={`Show ${contentLabel.toLowerCase()}`}
          />
        </div>
      </TooltipProvider>

      {mobileBar}
    </div>
  );
}

interface BuilderEdgeTabProps {
  side: 'left' | 'right';
  label: string;
  icon: LucideIcon;
  visible: boolean;
  onClick: () => void;
  tooltip: string;
}

function BuilderEdgeTab({
  side,
  label,
  icon: Icon,
  visible,
  onClick,
  tooltip,
}: BuilderEdgeTabProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={tooltip}
          tabIndex={visible ? 0 : -1}
          className={cn(
            'absolute top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2.5 xl:flex',
            'border border-primary/30 bg-primary px-2 py-5',
            'text-primary-foreground shadow-md shadow-primary/20',
            'ease-[cubic-bezier(0.16,1,0.3,1)] transition-all duration-500',
            'hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            side === 'left' ? 'left-0 rounded-r-xl border-l-0' : 'right-0 rounded-l-xl border-r-0',
            visible ? 'translate-x-0 opacity-100' : 'pointer-events-none opacity-0',
            !visible && side === 'left' && '-translate-x-2',
            !visible && side === 'right' && 'translate-x-2'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span
            className={cn(
              'text-[11px] font-semibold tracking-[0.06em] [writing-mode:vertical-rl]',
              side === 'left' ? 'rotate-180' : ''
            )}
          >
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side={side === 'left' ? 'right' : 'left'} className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface BuilderSideCollapseProps {
  mode: Exclude<BuilderViewMode, 'preview'>;
  onCollapse: () => void;
}

function BuilderSideCollapse({ mode, onCollapse }: BuilderSideCollapseProps) {
  const label = builderSideCollapseLabel(mode);
  if (!label) return null;

  const isContent = mode === 'content';
  const Icon = isContent ? ChevronLeft : ChevronRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={label}
          className={cn(
            'absolute top-1/2 z-30 hidden h-10 w-4 -translate-y-1/2 items-center justify-center xl:flex',
            'border border-border/70 bg-background/90 text-muted-foreground dark:border-border dark:bg-muted',
            'shadow-sm backdrop-blur-sm',
            'transition-[color,background-color,box-shadow,opacity] duration-200',
            'hover:bg-muted hover:text-foreground dark:hover:bg-muted/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            isContent ? 'left-0 -translate-x-1/2 rounded-md' : 'right-0 translate-x-1/2 rounded-md'
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={isContent ? 'right' : 'left'} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
