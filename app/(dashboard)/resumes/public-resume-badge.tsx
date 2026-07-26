import { cn } from '@/lib/utils';

/** Compact marker for the account's single public resume. */
export function PublicResumeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'absolute left-2 top-2 z-20 inline-flex items-center gap-1',
        'rounded-full bg-emerald-600 px-1.5 py-0.5',
        'text-[9px] font-medium leading-none text-white shadow-sm',
        className
      )}
    >
      <span className="size-1 shrink-0 rounded-full bg-white/80" aria-hidden />
      Public
    </span>
  );
}
