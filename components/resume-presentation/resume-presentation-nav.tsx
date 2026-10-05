import Link from 'next/link';

import { resumePresentationHref, type ResumePresentation } from '@/lib/resume/presentation';
import { cn } from '@/lib/utils';

const OPTIONS: ReadonlyArray<{ value: ResumePresentation; label: string }> = [
  { value: 'resume', label: 'Resume' },
  { value: 'follio', label: 'Follio' },
];

interface ResumePresentationNavProps {
  handle: string;
  current: ResumePresentation;
  /** `token` / `key` query, without the leading `?`. */
  accessQuery?: string;
  className?: string;
}

/**
 * Public switch between the traditional resume and its Follio view.
 * Links (not buttons) so each presentation has its own URL.
 */
export function ResumePresentationNav({
  handle,
  current,
  accessQuery = '',
  className,
}: ResumePresentationNavProps) {
  return (
    <nav
      aria-label="Resume view"
      className={cn(
        'inline-flex rounded-full border border-border/70 bg-background p-0.5',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const selected = current === option.value;
        return (
          <Link
            key={option.value}
            href={resumePresentationHref(handle, option.value, accessQuery)}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              selected
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
