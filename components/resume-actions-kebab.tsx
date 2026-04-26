'use client';

import { MoreVertical } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * ResumeActionsKebab
 *
 * Round, translucent kebab (`⋮`) trigger that opens a dropdown of the
 * same actions exposed by the floating action cluster. Visual recipe
 * matches `<FloatingIconButton>` so the trigger blends with the rest
 * of the resume chrome.
 *
 * Logic-free by design: each item just calls a handler the parent
 * already owns. The kebab adds *no* new behaviour — only a more
 * discoverable surface for the existing actions.
 */
export interface ResumeActionsKebabItem {
  /** Stable key for React. */
  key: string;
  /** Visible label and accessible name. */
  label: string;
  /** Icon to render to the left of the label. */
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ResumeActionsKebabProps {
  items: ResumeActionsKebabItem[];
  /** Tooltip side for the trigger. Defaults to `left`. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function ResumeActionsKebab({
  items,
  tooltipSide = 'left',
  className,
}: ResumeActionsKebabProps) {
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Resume actions"
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                'border border-border/60 bg-background/70 text-muted-foreground shadow-sm backdrop-blur-md',
                'transition-all duration-200',
                'hover:bg-background hover:text-foreground hover:shadow-md',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                'data-[state=open]:bg-background data-[state=open]:text-foreground',
                className
              )}
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className="text-xs">
          More actions
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={(event) => {
              // Prevent the default focus-restore behaviour from
              // racing with handlers that navigate or open dialogs.
              event.preventDefault();
              item.onClick();
            }}
            className="gap-2"
          >
            <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
