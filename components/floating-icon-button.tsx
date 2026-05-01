'use client';

import { forwardRef } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * FloatingIconButton
 *
 * Single round-icon overlay button used inside translucent floating
 * action clusters (e.g. resume preview overlays). Translucent at
 * rest, opaque on hover, with a tooltip describing the action.
 *
 * Extracted as a shared primitive so the builder preview and the
 * public resume view stay visually identical.
 */
interface FloatingIconButtonProps {
  /** Tooltip + accessible label (these stay in sync intentionally). */
  label: string;
  onClick: () => void;
  /** Icon (or other small node) rendered inside the button. */
  children: React.ReactNode;
  /** Side the tooltip should appear on. Defaults to `bottom`. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Optional className override merged onto the button. */
  className?: string;
  /** Disable the button (also disables the click handler). */
  disabled?: boolean;
}

export const FloatingIconButton = forwardRef<HTMLButtonElement, FloatingIconButtonProps>(
  function FloatingIconButton(
    { label, onClick, children, tooltipSide = 'bottom', className, disabled },
    ref
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-label={label}
            disabled={disabled}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full',
              'border border-border/60 bg-background/70 text-muted-foreground shadow-sm backdrop-blur-md',
              'transition-all duration-200',
              'hover:bg-background hover:text-foreground hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:pointer-events-none disabled:opacity-50',
              className
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
);

/**
 * FloatingActionCluster
 *
 * Translucent pill that holds a row of `FloatingIconButton`s.
 * Centralises the pill styling so every floating action cluster
 * looks identical regardless of where it's mounted.
 */
export function FloatingActionCluster({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-1.5 rounded-full',
        'border border-border/40 bg-background/40 p-1 shadow-sm backdrop-blur-md',
        'opacity-70 transition-opacity duration-200 hover:opacity-100',
        className
      )}
    >
      {children}
    </div>
  );
}
