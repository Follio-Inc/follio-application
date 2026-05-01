'use client';

/**
 * AppHeader — the single, canonical chrome bar for the entire product.
 *
 * Design philosophy
 * -----------------
 * Inspired by the chrome of Linear, Vercel, and Cron: a quiet,
 * scroll-aware glass bar that gets out of the way. The bar itself
 * carries no decoration when the page is at the top — only when the
 * user starts scrolling does a hairline shadow softly appear, marking
 * the bar as a distinct surface. This avoids the dated "always-on
 * border" look while still giving the chrome a clear edge once it
 * needs one.
 *
 * Why a single primitive
 * ----------------------
 * Before this, six different headers across the app each defined their
 * own height, background, container, and padding. Switching pages
 * produced a subtle but unmistakable "the bar just changed" jolt that
 * undermined the polish of a portfolio-builder product. This is the
 * *only* place where the chrome's visual language is defined; every
 * page-level header composes it and contributes only its own context.
 *
 * Visual language
 * ---------------
 * - Height        : 56px (`h-14`) — fits an 8×8 avatar with breathing
 *                   room, matches modern SaaS chrome.
 * - Surface       : translucent (`bg-background/70`) with `backdrop-
 *                   blur-2xl` and `saturate-150` for that refractive,
 *                   "floating glass" quality you see in modern apps.
 * - Edge          : NO border at the top of the page; a soft hairline
 *                   shadow fades in once the user scrolls. This keeps
 *                   the bar feeling like part of the page until the
 *                   page demands separation.
 * - Position      : sticky, `z-40` (dialogs/menus on `z-50` sit above).
 * - Container     : `mx-auto`, padded `px-4 sm:px-6`, with a tone-
 *                   driven max width.
 * - Slots         : three flex columns (`left` / `center` / `right`)
 *                   with consistent `gap-2` rhythm.
 *
 * Theming
 * -------
 * Public profile templates can tint the chrome by passing
 * `navbarTheme`. The mode lands on `data-navbar-theme`; the overrides
 * project as inline CSS variables, so existing `globals.css` selectors
 * keep working.
 */

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

import type { TemplateNavbarTheme } from '@/lib/portfolio/templates/types';

/** Container width tones — the chrome's *look* stays identical. */
type AppHeaderTone = 'app' | 'marketing';

interface AppHeaderProps {
  /** Brand + contextual content (badges, breadcrumbs). */
  left?: React.ReactNode;
  /** Optional centre slot — primary nav, switchers. */
  center?: React.ReactNode;
  /** Action cluster — auth, avatar menu, CTAs. */
  right?: React.ReactNode;
  /** `app` (default, max-w-screen-2xl) or `marketing` (max-w-7xl). */
  tone?: AppHeaderTone;
  /** Template navbar theme — projected as CSS variables on the bar. */
  navbarTheme?: TemplateNavbarTheme | null;
  /** Extra classes for the outer `<header>` element. */
  className?: string;
}

const TONE_CONTAINER: Record<AppHeaderTone, string> = {
  app: 'max-w-screen-2xl',
  marketing: 'max-w-7xl',
};

/**
 * Tracks whether the window has scrolled past a tiny threshold. Used
 * to fade in the chrome's separator shadow only once the page is
 * actually scrolled — modern bars don't shout for attention at rest.
 */
function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > threshold);
    handle();
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, [threshold]);

  return scrolled;
}

export function AppHeader({
  left,
  center,
  right,
  tone = 'app',
  navbarTheme,
  className,
}: AppHeaderProps) {
  const scrolled = useScrolled();

  const themeStyle = navbarTheme?.overrides
    ? (Object.fromEntries(
        Object.entries(navbarTheme.overrides).map(([key, value]) => [`--${key}`, value])
      ) as React.CSSProperties)
    : undefined;

  return (
    <header
      data-navbar-theme={navbarTheme?.mode}
      data-scrolled={scrolled || undefined}
      style={themeStyle}
      className={cn(
        'sticky top-0 z-40 w-full',
        // Glass surface
        'bg-background/70 backdrop-blur-2xl backdrop-saturate-150',
        'supports-[backdrop-filter]:bg-background/55',
        // Scroll-aware edge: soft shadow + hairline ring only when scrolled.
        'transition-shadow duration-200',
        scrolled
          ? 'shadow-[0_1px_0_0_hsl(var(--border)/0.6),0_8px_24px_-12px_hsl(var(--foreground)/0.08)]'
          : 'shadow-none',
        className
      )}
    >
      <div
        className={cn(
          'mx-auto flex h-14 w-full items-center gap-2 px-4 sm:px-6',
          TONE_CONTAINER[tone]
        )}
      >
        {/* Left cluster — brand + context. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none">{left}</div>

        {/* Centre cluster — primary nav. Centred on desktop. */}
        {center ? (
          <div className="hidden flex-1 items-center justify-center md:flex">{center}</div>
        ) : (
          <div className="hidden flex-1 md:block" aria-hidden />
        )}

        {/* Right cluster — actions. */}
        <div className="flex min-w-0 items-center justify-end gap-1.5 md:flex-1">{right}</div>
      </div>
    </header>
  );
}

/**
 * A near-invisible vertical hairline used between the brand mark and
 * an adjacent context cluster (e.g. an Admin badge). Subtle enough
 * not to read as a divider in casual viewing — present enough to
 * anchor the visual relationship.
 */
export function AppHeaderDivider({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('hidden h-5 w-px shrink-0 bg-border/50 sm:block', className)} />
  );
}
