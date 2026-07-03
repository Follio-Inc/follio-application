import { cn } from '@/lib/utils';

/** Compact portfolio marker using the app primary (purple) color. */
export function PortfolioResumeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute left-2 top-2 z-20 inline-flex items-center gap-1',
        'rounded-full bg-primary px-1.5 py-0.5',
        'text-[9px] font-medium leading-none text-primary-foreground shadow-sm',
        className
      )}
    >
      <span className="size-1 shrink-0 rounded-full bg-primary-foreground/80" aria-hidden />
      Portfolio
    </span>
  );
}
