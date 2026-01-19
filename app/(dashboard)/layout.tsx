import { UserButton } from '@clerk/nextjs';
import { ExternalLink, FileText, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Logo href="/dashboard" size="md" />
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/builder">
                <Button variant="ghost" size="sm" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Builder
                </Button>
              </Link>
              <Link href="/me">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Your Follio
                </Button>
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings">
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'h-8 w-8',
                },
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
