'use client';

import { ChevronLeft, ChevronRight, PenLine, WandSparkles, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DEFAULT_BUILDER_VIEW_MODE,
  builderSideCollapseLabel,
  closeBuilderSide,
  escapeBuilderViewMode,
  isBuilderContentRevealed,
  isBuilderDesignerActive,
  isBuilderDesignerRevealed,
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
  const contentRevealed = isBuilderContentRevealed(mode);
  const designerRevealed = isBuilderDesignerRevealed(mode);

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
                Stay in the flex strip when not revealed (opacity gutters) so
                canvas width/preview size never change during mode transitions.
                Column uses builder-base; inner surface is the elevated panel. */}
            <div
              data-builder-side="content"
              className={cn(
                'builder-base relative flex w-full min-w-0 flex-col xl:w-auto xl:flex-[4_0_0%]',
                contentClassName
              )}
              aria-hidden={contentRevealed ? undefined : true}
              inert={contentRevealed ? undefined : true}
            >
              {/* No adjacent margin — preview always owns the shared gap via
                  constant mx so insets do not jump mid-slide. */}
              <div className="builder-panel flex min-h-0 flex-1 flex-col overflow-y-auto xl:my-2.5 xl:ml-2.5 xl:rounded-xl">
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
              {/* Overflow stays on the inner surface so the seam collapse
                  control can sit fully in the gutter without being clipped. */}
              <div className="builder-panel relative flex h-full min-h-0 w-full min-w-0 flex-1 xl:mx-2.5 xl:my-2.5 xl:rounded-xl">
                <BuilderSideCollapse mode={mode} onCollapse={closeSide} />
                <div className="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden xl:rounded-xl">
                  {preview}
                </div>
              </div>
            </div>

            {/* Designer — xl only; flex 4; opacity gutter when not revealed */}
            <div
              data-builder-side="designer"
              className={cn(
                'builder-base relative hidden min-w-0 xl:flex xl:flex-[4_0_0%] xl:flex-col',
                designerClassName
              )}
              aria-hidden={designerRevealed ? undefined : true}
              inert={designerRevealed ? undefined : true}
            >
              <div className="builder-panel flex min-h-0 flex-1 flex-col overflow-hidden xl:my-2.5 xl:mr-2.5 xl:rounded-xl">
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
            'transition-[opacity,transform,box-shadow,background-color] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
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
  mode: BuilderViewMode;
  onCollapse: () => void;
}

/** Keep both chevrons mounted and crossfade so content↔designer doesn’t teleport. */
function BuilderSideCollapse({ mode, onCollapse }: BuilderSideCollapseProps) {
  return (
    <>
      <BuilderSideCollapseButton
        side="content"
        visible={mode === 'content'}
        onCollapse={onCollapse}
      />
      <BuilderSideCollapseButton
        side="designer"
        visible={mode === 'designer'}
        onCollapse={onCollapse}
      />
    </>
  );
}

interface BuilderSideCollapseButtonProps {
  side: 'content' | 'designer';
  visible: boolean;
  onCollapse: () => void;
}

function BuilderSideCollapseButton({ side, visible, onCollapse }: BuilderSideCollapseButtonProps) {
  const label = builderSideCollapseLabel(side);
  if (!label) return null;

  const isContent = side === 'content';
  const Icon = isContent ? ChevronLeft : ChevronRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={label}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
          className={cn(
            'absolute top-1/2 z-30 hidden h-10 w-4 -translate-y-1/2 items-center justify-center xl:flex',
            'rounded-full border border-border/60 bg-background text-foreground/55',
            'shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.08)]',
            'dark:border-border/80 dark:bg-card dark:text-foreground/65 dark:shadow-[0_1px_2px_rgba(0,0,0,0.35),0_4px_12px_rgba(0,0,0,0.28)]',
            'transition-[opacity,color,background-color,border-color,box-shadow,transform] duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            'hover:border-border hover:bg-muted/80 hover:text-foreground hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_8px_18px_rgba(15,23,42,0.12)]',
            'dark:hover:bg-muted dark:hover:text-foreground',
            'active:scale-[0.96]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isContent ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
            visible ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <Icon className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side={isContent ? 'right' : 'left'} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
