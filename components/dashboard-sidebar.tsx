'use client';

/**
 * DashboardTopbar
 *
 * Authenticated app chrome for the dashboard surfaces. Composes the
 * canonical `AppHeader` so the bar's height, glass background, and
 * scroll-aware edge are byte-identical to every other top bar in the
 * product. This layer owns *only* the slot contents — primary nav and
 * the mobile drawer.
 *
 * Navigation style
 * ----------------
 * A single segmented control (Linear / Vercel / Arc pattern):
 *   - Icon + label *inline* (not stacked) — reads as language, not iconography.
 *   - One shared, spring-animated indicator slides between tabs instead of
 *     each pill toggling its own background — the motion makes the active
 *     state feel like one continuous control, which is the 2026 standard.
 *   - The track is a barely-there tinted shell so the group reads as one
 *     cohesive control rather than independent links.
 *   - Hover quietly raises inactive tabs; the active tab is firm but calm.
 *
 * Layout
 * ------
 *   Desktop : [Logo · Segmented nav]                                  [Avatar]
 *   Mobile  : [☰ · Logo]                                              [Avatar]
 *
 * Settings has intentionally been removed from the top bar surface
 * (both the desktop utility cluster and the mobile drawer). It now
 * lives exclusively inside the avatar dropdown, where account-level
 * preferences belong — keeping the chrome focused on the product areas
 * a user actually navigates between (Home, Portfolio, Resumes).
 */

import { motion } from 'framer-motion';
import { FileText, Globe, Home, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader, AppHeaderDivider } from '@/components/app-header';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/* ───────────────────────────── Types ───────────────────────────── */

interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ElementType;
  match: (path: string) => boolean;
}

/* ───────────────────────────── Data ────────────────────────────── */

/**
 * Shared layout id for the spring-animated active indicator. A single id
 * across every tab lets framer-motion slide one element between them.
 */
const NAV_INDICATOR_LAYOUT_ID = 'dashboard-nav-indicator';

/** Primary product areas — left-anchored next to the brand. */
const primaryItems: NavItemConfig[] = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: Home,
    match: (path) => path === '/dashboard',
  },
  {
    // Resolves to the owner's live portfolio (`/u/[handle]`), where the
    // dashboard chrome travels with them — so this tab stays highlighted.
    href: '/me',
    label: 'Portfolio',
    icon: Globe,
    match: (path) => path.startsWith('/u/'),
  },
  {
    href: '/resumes',
    label: 'Resumes',
    icon: FileText,
    // Builder is its own focused workspace (with its own ResumeSwitcher in the
    // top-right) so we deliberately do NOT highlight "Resumes" while inside
    // the builder — the page context is owned by the builder, not the listing.
    match: (path) => path.startsWith('/resumes'),
  },
];

/* ──────────────────────── Sub-components ────────────────────────── */

/**
 * A single tab inside the segmented nav. The active tab renders the shared
 * `motion` indicator; because every active tab uses the same `layoutId`,
 * framer-motion animates one continuous element sliding between them.
 */
function SegmentedNavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: NavItemConfig & { isActive: boolean }) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {isActive && (
        <motion.span
          layoutId={NAV_INDICATOR_LAYOUT_ID}
          className="absolute inset-0 z-0 rounded-full bg-background shadow-sm ring-1 ring-border/60"
          transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
        />
      )}
      <Icon className="relative z-10 h-[15px] w-[15px]" strokeWidth={2} />
      <span className="relative z-10">{label}</span>
    </Link>
  );
}

/** Mobile drawer nav item — horizontal layout. */
function MobileNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  onClick,
}: NavItemConfig & { isActive: boolean; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span>{label}</span>
    </Link>
  );
}

/* ──────────────────────── Main Component ────────────────────────── */

export function DashboardTopbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <>
      <AppHeader
        left={
          <>
            <button
              onClick={() => setMobileOpen(true)}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors md:hidden',
                'hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
              )}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo href="/dashboard" size="md" />

            {/* Primary nav — a single segmented control with one shared,
                spring-animated indicator that slides between tabs. Hosted
                in a faintly tinted shell so the group reads as one control,
                not a row of loose links. */}
            <nav
              aria-label="Primary"
              className="ml-2 hidden items-center gap-0.5 rounded-full bg-muted/50 p-1 ring-1 ring-border/40 md:flex"
            >
              {primaryItems.map((item) => (
                <SegmentedNavItem key={item.href} {...item} isActive={item.match(pathname)} />
              ))}
            </nav>
          </>
        }
        right={
          <>
            {children && <AppHeaderDivider className="mx-1 hidden md:block" />}
            {children}
          </>
        }
      />

      {/* ── Mobile drawer ───────────────────────────────────────── */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] border-r bg-background shadow-2xl transition-transform duration-300 ease-out md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Logo href="/dashboard" size="md" />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-0.5 px-3 py-4" aria-label="Mobile navigation">
          {primaryItems.map((item) => (
            <MobileNavItem
              key={item.href}
              {...item}
              isActive={item.match(pathname)}
              onClick={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}
