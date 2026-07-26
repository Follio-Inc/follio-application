'use client';

import { ArrowLeft, BarChart3, Menu, Shield, Users, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ADMIN_PANEL_NAV, type AdminPanelModuleId } from '@/_admin-panel/nav';
import { AppHeader, AppHeaderDivider } from '@/components/app-header';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const ICONS: Record<AdminPanelModuleId, React.ElementType> = {
  overview: BarChart3,
  developer: Wrench,
  users: Users,
};

function matchPath(id: AdminPanelModuleId, path: string, href: string): boolean {
  if (id === 'overview') return path === '/admin';
  return path === href || path.startsWith(`${href}/`);
}

function SideNavItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string;
  children: React.ReactNode;
}) {
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

  const sidebar = (
    <nav className="space-y-1 px-3 py-4">
      {ADMIN_PANEL_NAV.map((item) => (
        <SideNavItem
          key={item.id}
          href={item.href}
          icon={ICONS[item.id]}
          label={item.label}
          isActive={matchPath(item.id, pathname, item.href)}
        />
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
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
            <Logo href="/admin" size="md" />
            <AppHeaderDivider />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
              <Shield className="h-3 w-3" />
              Admin
            </span>
          </>
        }
        right={
          <>
            <span className="hidden text-xs text-muted-foreground sm:block">{adminEmail}</span>
            <Link
              href="/dashboard"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors',
                'hover:bg-muted/60 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
              )}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to app</span>
            </Link>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 border-r bg-background md:block">{sidebar}</aside>

        <div
          className={cn(
            'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300 md:hidden',
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 border-r bg-background shadow-xl transition-transform duration-300 ease-in-out md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <Logo href="/admin" size="sm" />
              <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">
                Admin
              </span>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {sidebar}
        </aside>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
