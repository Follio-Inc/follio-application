/**
 * Shared onboarding surface language — sourced from ResumeStartChoice.
 * Use these tokens so every onboarding step stays visually coherent.
 *
 * Layout tokens are tuned so a typical laptop viewport keeps the primary
 * Next/Continue CTA in view without sticky positioning — chrome is compact
 * and the shell fills the remaining viewport.
 */

const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(0,0,0,0.04)]';
const SOFT_SHADOW_HOVER = 'hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]';

/** Soft glass panel used for static connect/summary cards. */
export const ONBOARDING_SURFACE = [
  'rounded-2xl border border-border/50 bg-card/80',
  SOFT_SHADOW,
  'backdrop-blur-sm',
].join(' ');

/** Choice / selectable cards — soft lift on hover. */
export const ONBOARDING_SURFACE_INTERACTIVE = [
  ONBOARDING_SURFACE,
  'transition-all duration-200',
  'hover:-translate-y-0.5 hover:border-border hover:bg-card',
  SOFT_SHADOW_HOVER,
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2',
  'active:translate-y-0 active:scale-[0.99]',
].join(' ');

/** Selected state for interactive choice cards. */
export const ONBOARDING_SURFACE_SELECTED =
  'border-foreground/25 bg-card shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)] ring-1 ring-foreground/15';

/** Muted inset well for icons — fixed size everywhere. */
export const ONBOARDING_ICON_WELL =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/40 ring-1 ring-inset ring-border/40';

/** Quiet status / recommended pill. */
export const ONBOARDING_QUIET_PILL =
  'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground';

/** Success / connected pill — quiet, not primary-tinted. */
export const ONBOARDING_SUCCESS_PILL =
  'inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground';

/** Title + description on choice / connect cards. */
export const ONBOARDING_CARD_TITLE = 'text-sm font-medium tracking-tight text-foreground';
export const ONBOARDING_CARD_DESCRIPTION =
  'text-xs leading-relaxed text-muted-foreground sm:text-[13px]';

/** Page-level title / subtitle (import, purpose, review). */
export const ONBOARDING_PAGE_TITLE = 'text-display text-xl tracking-tight sm:text-2xl';
export const ONBOARDING_PAGE_SUBTITLE =
  'mt-1.5 text-sm leading-relaxed text-muted-foreground sm:mt-2 sm:text-[15px]';

/** Dashed upload dropzone (rest + drag-active). Primary reserved for CTAs/progress only. */
export const ONBOARDING_DROPZONE =
  'rounded-2xl border-2 border-dashed border-border/50 bg-card/80 transition-all duration-200';
export const ONBOARDING_DROPZONE_ACTIVE = 'scale-[1.01] border-foreground/25 bg-muted/40';

/** Compact summary row (import “All set” list). */
export const ONBOARDING_SUMMARY_ROW = [
  'flex items-center gap-2 rounded-2xl border border-border/50 bg-card/80 p-4 text-sm',
  SOFT_SHADOW,
].join(' ');

/**
 * Page shell — fills the viewport below the app header so the footer CTA
 * can sit in normal document flow at the bottom of short steps.
 */
export const ONBOARDING_PAGE_SHELL =
  'relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-7';

/** Wider page shell when a step needs more horizontal room. */
export const ONBOARDING_PAGE_SHELL_WIDE =
  'relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-7';

/** Segmented step track above the title. */
export const ONBOARDING_STEP_TRACK = 'mb-5 shrink-0';

/** Step title block. */
export const ONBOARDING_STEP_HEADER = 'mb-5 shrink-0';
export const ONBOARDING_STEP_HEADER_COMPACT = 'mb-3 shrink-0';

/** Main step body — takes leftover viewport; dense steps may overflow-hidden. */
export const ONBOARDING_MAIN = 'flex min-h-0 flex-1 flex-col';
export const ONBOARDING_MAIN_CLIP = 'flex min-h-0 flex-1 flex-col overflow-hidden';

/** Footer nav — mt-auto keeps Next in the first viewport on short steps. */
export const ONBOARDING_FOOTER =
  'mt-auto flex shrink-0 items-center justify-between border-t border-border/50 pt-4';

/** Compact footer for multi-step review navigation. */
export const ONBOARDING_FOOTER_COMPACT =
  'mt-auto flex shrink-0 items-center justify-between border-t border-border/50 pt-4';

/** Form Card override for review editors. */
export const ONBOARDING_FORM_CARD = [
  'rounded-2xl border-border/50 bg-card/80',
  SOFT_SHADOW,
  'backdrop-blur-sm',
].join(' ');

/** Standard surface padding for connect / summary panels. */
export const ONBOARDING_SURFACE_PAD = 'p-4 sm:p-5';

/**
 * Soft inset stage for floating profile marks (constellation / photo wall).
 * Uses the same border/radius language as surfaces — muted wash, not a second theme.
 */
export const ONBOARDING_CONSTELLATION_STAGE = [
  'relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/50',
  'bg-muted/30',
  SOFT_SHADOW,
].join(' ');
