'use client';

import { Database, FileText, Palette, Share2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/builder',
    label: 'Resume',
    icon: FileText,
    match: (path: string) => path.startsWith('/builder'),
  },
  {
    href: '/portfolio',
    label: 'Portfolio',
    icon: Palette,
    match: (path: string) => path.startsWith('/portfolio'),
  },
  {
    href: '/data-sources',
    label: 'Data Sources',
    icon: Database,
    match: (path: string) => path.startsWith('/data-sources'),
  },
  {
    href: '/share',
    label: 'Share & Publish',
    icon: Share2,
    match: (path: string) => path.startsWith('/share'),
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-background/80">
      <div className="flex items-center gap-1 px-4 sm:px-6 lg:px-8">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
