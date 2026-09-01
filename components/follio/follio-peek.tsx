'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { canHoverOpenPeek, PEEK_CLOSE_DELAY_MS, PEEK_OPEN_DELAY_MS } from './peek-hover';

/**
 * Opening a floating surface focuses it, and browsers will scroll that node
 * into view. For a portaled overlay that would yank the page to the top.
 * Keep focus for keyboard users without moving the document.
 */
export function focusWithoutScroll(event: Event) {
  event.preventDefault();
  const node = event.target;
  if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
    node.focus({ preventScroll: true });
  }
}

function fineHoverAvailable(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  const hover = window.matchMedia('(hover: hover)');
  const pointer = window.matchMedia('(pointer: fine)');
  return canHoverOpenPeek({
    hover: hover.matches ? 'hover' : 'none',
    pointer: pointer.matches ? 'fine' : 'coarse',
  });
}

function eventInside(node: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(node && target instanceof Node && node.contains(target));
}

interface FollioPeekProps {
  /** Accessible name for the trigger. */
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  /** Dashboard thumbnail / non-interactive Follio. */
  disabled?: boolean;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Role, school, and company details. Resting on the name opens a reading
 * panel next to it; a click pins it. The panel stays in the viewport and
 * scrolls its own copy instead of cutting it off.
 */
export function FollioPeek({
  label,
  trigger,
  children,
  disabled = false,
  className,
  onOpenChange,
}: FollioPeekProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pinnedRef = useRef(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  };

  useEffect(() => () => clearTimers(), []);

  const setPeekOpen = (next: boolean, pinned: boolean) => {
    clearTimers();
    pinnedRef.current = next ? pinned : false;
    setOpen(next);
    onOpenChange?.(next);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPeekOpen(true, true);
      return;
    }
    setPeekOpen(false, false);
  };

  const ignoreIfOnTrigger = (event: { target: EventTarget | null; preventDefault: () => void }) => {
    if (eventInside(triggerRef.current, event.target)) event.preventDefault();
  };

  const onTriggerClick = () => {
    if (open && pinnedRef.current) {
      setPeekOpen(false, false);
      return;
    }
    setPeekOpen(true, true);
  };

  const onTriggerEnter = () => {
    if (!fineHoverAvailable()) return;
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) return;
    openTimerRef.current = window.setTimeout(() => {
      setPeekOpen(true, false);
    }, PEEK_OPEN_DELAY_MS);
  };

  const onTriggerLeave = () => {
    if (openTimerRef.current != null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (!open || pinnedRef.current) return;
    closeTimerRef.current = window.setTimeout(() => {
      setPeekOpen(false, false);
    }, PEEK_CLOSE_DELAY_MS);
  };

  const onContentEnter = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const onContentLeave = () => {
    if (pinnedRef.current) return;
    closeTimerRef.current = window.setTimeout(() => {
      setPeekOpen(false, false);
    }, PEEK_CLOSE_DELAY_MS);
  };

  if (disabled) return <>{trigger}</>;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={onTriggerClick}
          onPointerEnter={onTriggerEnter}
          onPointerLeave={onTriggerLeave}
          className={cn(
            'inline cursor-pointer rounded-sm text-left transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            className
          )}
        >
          {trigger}
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={8}
        avoidCollisions
        role="dialog"
        aria-label={label}
        onOpenAutoFocus={(event) => {
          if (!pinnedRef.current) {
            event.preventDefault();
            return;
          }
          focusWithoutScroll(event);
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={ignoreIfOnTrigger}
        onFocusOutside={ignoreIfOnTrigger}
        onInteractOutside={ignoreIfOnTrigger}
        onPointerEnter={onContentEnter}
        onPointerLeave={onContentLeave}
        className={cn(
          'relative flex max-h-[min(70vh,24rem)] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden p-0',
          'text-foreground'
        )}
      >
        <button
          type="button"
          onClick={() => setPeekOpen(false, false)}
          className="absolute right-2.5 top-2.5 z-10 rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain break-words p-5 pr-11">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
