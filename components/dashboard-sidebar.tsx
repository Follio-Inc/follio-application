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
 * Modern horizontal pill tabs (Linear / Vercel / Cron pattern):
 *   - Icon + label *inline* (not stacked) — reads as language, not iconography.
 *   - Active state is a soft filled pill (`bg-muted/80`), not an underline.
 *   - Pills sit in a single row, with a barely-there grouping background
 *     so the nav feels like one cohesive control rather than three
 *     independent links.
 *   - Hover lifts subtly; active is firm but quiet.
 *
 * Layout
 * ------
 *   Desktop : [Logo · Pill nav]                                       [Avatar]
 *   Mobile  : [☰ · Logo]                                              [Avatar]
 *
 * Settings has intentionally been removed from the top bar surface
 * (both the desktop utility cluster and the mobile drawer). It now
 * lives exclusively inside the avatar dropdown, where account-level
 * preferences belong — keeping the chrome focused on the two product
 * areas a user actually navigates between (Home, Resumes).
 */

import { Home, LayoutGrid, Menu, X } from 'lucide-react';
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

/** Primary product areas — left-anchored next to the brand. */
const primaryItems: NavItemConfig[] = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: Home,
    match: (path) => path === '/dashboard',
  },
  {
    href: '/resumes',
    label: 'Resumes',
    icon: LayoutGrid,
    // Builder is its own focused workspace (with its own ResumeSwitcher in the
    // top-right) so we deliberately do NOT highlight "Resumes" while inside
    // the builder — the page context is owned by the builder, not the listing.
    match: (path) => path.startsWith('/resumes'),
  },
];

/* ──────────────────────── Sub-components ────────────────────────── */

/**
 * A single horizontal pill nav item. Active pills carry a soft filled
 * background (no underline). Hover state is a slightly lifted tone.
 */
function PillNavItem({ href, icon: Icon, label, isActive }: NavItemConfig & { isActive: boolean }) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        isActive
          ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon
        className={cn('h-[15px] w-[15px]', isActive ? 'text-foreground' : 'text-muted-foreground')}
        strokeWidth={2}
      />
      <span>{label}</span>
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

            {/* Primary nav — modern segmented pill cluster.
                Hosted in a faintly tinted shell so the group reads as
                one control, not three loose links. */}
            <nav
              aria-label="Primary"
              className="ml-2 hidden items-center gap-0.5 rounded-full bg-muted/40 p-0.5 md:flex"
            >
              {primaryItems.map((item) => (
                <PillNavItem key={item.href} {...item} isActive={item.match(pathname)} />
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
