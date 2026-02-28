'use client';

import { Database, FileText, LayoutGrid, Menu, Palette, Settings, Share2, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

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

/** Left side — the products users build */
const leftItems: NavItemConfig[] = [
  {
    href: '/resumes',
    label: 'My Resumes',
    icon: LayoutGrid,
    match: (path) => path.startsWith('/resumes'),
  },
  {
    href: '/builder',
    label: 'Editor',
    icon: FileText,
    match: (path) => path.startsWith('/builder'),
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: Palette,
    match: (path) => path.startsWith('/portfolio'),
  },
];

/** Right side — utilities & account */
const rightItems: NavItemConfig[] = [
  {
    href: '/data-sources',
    label: 'Data Sources',
    icon: Database,
    match: (path) => path.startsWith('/data-sources'),
  },
  {
    href: '/share',
    label: 'Share',
    icon: Share2,
    match: (path) => path.startsWith('/share'),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    match: (path) => path.startsWith('/settings'),
  },
];

/* ──────────────────────── Sub-components ────────────────────────── */

/** A single icon+label nav item (LinkedIn-style: icon above label) */
function TopNavItem({ href, icon: Icon, label, isActive }: NavItemConfig & { isActive: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground'
      )}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
      <span className="hidden text-[11px] font-medium leading-tight sm:block">{label}</span>
      {/* Active indicator line */}
      {isActive && (
        <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-foreground" />
      )}
    </Link>
  );
}

/** Mobile drawer nav item — horizontal layout */
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
      className={cn(
        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

/* ──────────────────────── Main Component ────────────────────────── */

/**
 * LinkedIn-style top navigation bar.
 *
 * Left:  [Logo]  |  [Resume]  [Portfolio]
 * Right: [Data Sources]  [Share]  [Settings]  [children → UserMenu]
 */
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

  const allItems = [...leftItems, ...rightItems];

  return (
    <>
      {/* ── Desktop / Tablet: top bar ─────────────────────────────── */}
      <nav className="relative z-50 hidden h-14 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex">
        {/* Left cluster: Logo + product nav */}
        <div className="flex items-center gap-1 pl-4 sm:pl-6">
          <div className="mr-4">
            <Logo href="/" size="md" />
          </div>
          <div className="flex items-center border-l pl-4">
            {leftItems.map((item) => (
              <TopNavItem key={item.href} {...item} isActive={item.match(pathname)} />
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right cluster: utilities + user avatar */}
        <div className="flex items-center gap-1 pr-4 sm:pr-6">
          {rightItems.map((item) => (
            <TopNavItem key={item.href} {...item} isActive={item.match(pathname)} />
          ))}
          {/* User menu (avatar) */}
          {children && <div className="ml-2 border-l pl-3">{children}</div>}
        </div>
      </nav>

      {/* ── Mobile: compact bar + hamburger ────────────────────────── */}
      <div className="flex h-14 items-center border-b bg-background/95 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="pl-4 pr-2 text-muted-foreground hover:text-foreground"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo href="/" size="sm" />
        <div className="flex-1" />
        {/* User menu on mobile too */}
        {children && <div className="pr-4">{children}</div>}
      </div>

      {/* ── Mobile: backdrop ──────────────────────────────────────── */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />

      {/* ── Mobile: slide-out drawer ──────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] border-r bg-background shadow-xl transition-transform duration-300 ease-in-out md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Logo href="/" size="md" />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {allItems.map((item) => (
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
