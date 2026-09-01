/**
 * A connected career/education timeline. A single rail threads through the logo
 * nodes so a sequence of roles reads as one continuous story rather than a stack
 * of disconnected rows — the difference between a list and a narrative.
 *
 * Layout per item:
 *
 *   ●─[logo]  Title                                Dates
 *   │         Subtitle
 *   │
 *   ●─[logo]  …
 */
export function FollioTimeline({ children }: { children: React.ReactNode }) {
  return <ol className="relative">{children}</ol>;
}

interface FollioTimelineItemProps {
  /** The logo tile that sits on the rail. */
  node: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned metadata, typically the date range. */
  trailing?: React.ReactNode;
  /** Marks the present role with a live pulse on its node. */
  current?: boolean;
}

export function FollioTimelineItem({
  node,
  title,
  subtitle,
  trailing,
  current = false,
}: FollioTimelineItemProps) {
  return (
    <li className="group/ti relative flex gap-4 pb-6 last:pb-0">
      {/* The rail: runs from just below this node to the next one. Hidden on the
          final item so the line ends cleanly rather than trailing into space. */}
      <span
        aria-hidden
        className="absolute bottom-1 left-[21px] top-12 w-px bg-border/70 group-last/ti:hidden"
      />

      <div className="relative z-[1] shrink-0">
        {node}
        {current ? (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-card bg-primary" />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold leading-snug text-foreground">{title}</p>
          {/* Desktop: dates ride the same baseline as the title, right-aligned. */}
          {trailing ? (
            <p className="hidden shrink-0 whitespace-nowrap pt-px text-[12.5px] tabular-nums text-muted-foreground sm:block">
              {trailing}
            </p>
          ) : null}
        </div>
        {subtitle ? (
          <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{subtitle}</div>
        ) : null}
        {/* Mobile: a full-width title should not fight the dates for space, so
            they drop to their own quiet line below. */}
        {trailing ? (
          <p className="mt-1 text-[12.5px] tabular-nums text-muted-foreground/80 sm:hidden">
            {trailing}
          </p>
        ) : null}
      </div>
    </li>
  );
}
