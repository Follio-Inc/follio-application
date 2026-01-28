import { UserButton } from '@clerk/nextjs';
import { Eye } from 'lucide-react';
import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo href="/me" size="md" />
          <div className="flex items-center gap-3">
            <Link href="/me">
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Your Follio
              </Button>
            </Link>
            <UserButton
              afterSignOutUrl="/"
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
