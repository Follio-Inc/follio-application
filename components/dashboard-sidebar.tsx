'use client';

/**
 * DashboardTopbar
 *
 * Authenticated app chrome for the dashboard surfaces. Composes the
 * canonical `AppHeader` so the bar's height, glass background, and
 * scroll-aware edge are byte-identical to every other top bar in the
 * product. This layer owns *only* the slot contents.
 *
 * Layout
 * ------
 *   [Logo]                                    [Dashboard · … · Avatar]
 *
 * A single Dashboard affordance on the right — icon + label, sitting
 * immediately left of the profile menu — replaces the old segmented
 * Home / Portfolio / Resumes nav. Portfolio, resumes, and settings
 * remain reachable from the dashboard and avatar menu.
 */

import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

/* ──────────────────────── Sub-components ────────────────────────── */

function DashboardLink({ isActive }: { isActive: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        isActive
          ? 'bg-muted/70 text-foreground ring-1 ring-border/50'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <LayoutDashboard className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
      <span>Dashboard</span>
    </Link>
  );
}

/* ──────────────────────── Main Component ────────────────────────── */

export function DashboardTopbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  return (
    <AppHeader
      left={<Logo href="/dashboard" size="md" />}
      right={
        <div className="flex items-center gap-2">
          <DashboardLink isActive={isDashboard} />
          {children}
        </div>
      }
    />
  );
}
