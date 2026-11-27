'use client';

import type { ResumePresentation } from '@/lib/resume/presentation';
import { cn } from '@/lib/utils';

const OPTIONS: ReadonlyArray<{ value: ResumePresentation; label: string }> = [
  { value: 'resume', label: 'Resume' },
  { value: 'follio', label: 'Follio' },
];

interface ResumePresentationSwitchProps {
  value: ResumePresentation;
  onChange: (next: ResumePresentation) => void;
  className?: string;
}

/**
 * Resume | Follio for surfaces that swap in place, such as the builder preview.
 * The public pages use links instead, so each presentation keeps its own URL.
 */
export function ResumePresentationSwitch({
  value,
  onChange,
  className,
}: ResumePresentationSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Resume view"
      className={cn(
        'inline-flex rounded-full border border-border/70 bg-background p-0.5',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-7 rounded-full px-3 text-[12px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
