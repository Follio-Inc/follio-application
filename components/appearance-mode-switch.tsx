'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AppearanceMode = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { value: AppearanceMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

interface AppearanceModeSwitchProps {
  value: AppearanceMode;
  onChange: (value: AppearanceMode) => void;
  className?: string;
  /** Accessible name for the radiogroup, e.g. "Resume theme" or "Portfolio appearance" */
  ariaLabel: string;
  /** Compact icon-only control for tight headers (e.g. preview panel). */
  variant?: 'default' | 'compact';
}

export function AppearanceModeSwitch({
  value,
  onChange,
  className,
  ariaLabel,
  variant = 'default',
}: AppearanceModeSwitchProps) {
  const isCompact = variant === 'compact';

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(
          isCompact
            ? 'inline-flex items-center rounded-md bg-muted/40 p-0.5'
            : 'grid grid-cols-3 gap-1.5'
        )}
      >
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;

          const button = (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              className={cn(
                'transition-colors duration-150',
                isCompact
                  ? cn(
                      'flex h-6 w-6 items-center justify-center rounded-[5px]',
                      isSelected
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground/60 hover:text-muted-foreground'
                    )
                  : cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center',
                      isSelected
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border/60 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground'
                    )
              )}
            >
              <Icon className={cn('shrink-0', isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
              {!isCompact && (
                <span className="text-[11px] font-medium leading-none">{option.label}</span>
              )}
            </button>
          );

          if (isCompact) {
            return (
              <Tooltip key={option.value}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {option.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </div>
    </div>
  );
}
