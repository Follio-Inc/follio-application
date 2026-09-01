/**
 * Shared chip language for the Follio reach row. Contact is full-width on its
 * own line; Resume, GitHub, and LinkedIn share equal columns below it.
 */
export const FOLLIO_CHIP =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 px-3 ' +
  'text-[13px] font-medium text-foreground transition-colors';

export const FOLLIO_CHIP_INTERACTIVE =
  'hover:border-foreground/25 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

export const FOLLIO_CHIP_ICON_ACTION =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground ' +
  'transition-colors hover:bg-muted hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
