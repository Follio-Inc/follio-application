/**
 * Action styling for Developer Platform links.
 *
 * Presentation only — no behaviour, no state, no data. It exists so the
 * platform's action links stop being plain text without each one growing its
 * own copy of the same four lines of Tailwind, and so there is one place to
 * change if the family changes.
 *
 * ## The family
 *
 * Taken from the Resume Lab's "Run the fixture" button, which is the platform's
 * existing reference for a primary action: `h-9 rounded-md border px-3 text-sm
 * font-medium transition-colors` with `bg-primary text-primary-foreground
 * hover:bg-primary/90`. `tone: 'primary'` reproduces exactly that, so a styled
 * link and that button read as the same control.
 *
 * The focus ring is the repository's own, lifted from `buttonVariants` in
 * `components/ui/button.tsx` rather than invented here. That shared `Button` is
 * deliberately **not** imported: its default variant is `rounded-lg`,
 * `hover:bg-primary/88` and `active:scale-[0.98]`, so it would neither match
 * "Run the fixture" nor keep the platform free of the scale animation. Nothing
 * else in `platform/ui/` imports a product component either.
 *
 * "Run the fixture" itself still carries its classes inline. Pointing it here
 * would be the tidier end state, but it lives among the lab's run handlers and
 * a styling pass has no business editing that file; the duplication is one
 * button's worth and is recorded here rather than hidden.
 */

import { cn } from '@/lib/utils';

/**
 * How loud the action is.
 *
 * `primary` for the one thing a card is for — opening a lab. `quiet` for
 * navigation and for secondary actions that should look like controls without
 * competing with the content around them.
 */
export type PlatformActionTone = 'primary' | 'quiet';

/** `compact` for actions that sit inside dense rows, cards and chip lists. */
export type PlatformActionSize = 'default' | 'compact';

export function platformAction(
  options: {
    tone?: PlatformActionTone;
    size?: PlatformActionSize;
    /** Appended last, so a call site can still adjust layout. */
    className?: string;
  } = {}
): string {
  const { tone = 'primary', size = 'default', className } = options;

  return cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    size === 'compact' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3 text-sm',
    tone === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'bg-transparent text-foreground hover:bg-muted',
    className
  );
}
