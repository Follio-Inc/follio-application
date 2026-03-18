'use client';

import { ArrowLeft, BarChart3, Menu, Shield, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    icon: BarChart3,
    match: (path) => path === '/admin',
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: Users,
    match: (path) => path.startsWith('/admin/users'),
  },
];

function SideNavItem({ href, icon: Icon, label, isActive }: NavItem & { isActive: boolean }) {
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
      {NAV_ITEMS.map((item) => (
        <SideNavItem key={item.href} {...item} isActive={item.match(pathname)} />
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
      {/* Top bar */}
      <header className="relative z-50 flex h-14 items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="pl-4 pr-2 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 px-4 sm:px-6">
          <Logo href="/admin" size="md" />
          <div className="flex items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
            <Shield className="h-3 w-3" />
            Admin
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4 pr-4 sm:pr-6">
          <span className="hidden text-xs text-muted-foreground sm:block">{adminEmail}</span>
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 border-r bg-background md:block">{sidebar}</aside>

        {/* Mobile backdrop */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity duration-300 md:hidden',
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />

        {/* Mobile drawer */}
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

        {/* Main content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
