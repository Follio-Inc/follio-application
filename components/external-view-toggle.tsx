'use client';

import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ExternalViewToggleProps {
  active: boolean;
  onToggle: () => void;
  /** When the authenticated top bar is visible — positions the pill below it. */
  headerVisible: boolean;
}

/**
 * Owner-only control for previewing a resume/portfolio exactly as an
 * external visitor would see it. Fixed to the top-right, below the
 * workspace chrome when present.
 */
export function ExternalViewToggle({ active, onToggle, headerVisible }: ExternalViewToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'fixed right-4 z-50 inline-flex items-center gap-2 rounded-full print:hidden',
        'border border-border/40 bg-background/40 px-3.5 py-2 text-[13px] font-medium text-foreground/80 shadow-sm backdrop-blur-md',
        'opacity-70 transition-all duration-200 ease-in-out',
        'hover:border-border/60 hover:bg-background/90 hover:text-foreground hover:opacity-100 hover:shadow-md',
        'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        headerVisible ? 'top-[4.25rem]' : 'top-4'
      )}
    >
      {active ? (
        <>
          <EyeOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          Exit External User View
        </>
      ) : (
        <>
          <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          View as External User
        </>
      )}
    </button>
  );
}
