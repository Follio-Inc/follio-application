import { cn } from '@/lib/utils';

interface FollioSectionProps {
  title: string;
  /** Optional pill shown beside the section title, e.g. total experience. */
  tag?: string | null;
  children: React.ReactNode;
  className?: string;
}

/** Shared shell for the depth sections below the hero and connect blocks. */
export function FollioSection({ title, tag, children, className }: FollioSectionProps) {
  return (
    <section className={cn('scroll-mt-24', className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-eyebrow">{title}</h2>
        {tag ? (
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
