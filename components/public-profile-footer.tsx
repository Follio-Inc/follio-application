'use client';

import Link from 'next/link';

import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

interface PublicProfileFooterProps {
  className?: string;
}

/**
 * Platform footer for anonymous visitors on shared resume/portfolio links.
 * Keeps branding and sign-up paths at the bottom so the content surface
 * stays clean for hiring managers and other external viewers.
 */
export function PublicProfileFooter({ className }: PublicProfileFooterProps) {
  return (
    <footer
      className={cn(
        'border-t border-border/60 bg-gradient-to-b from-muted/20 to-background print:hidden',
        className
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-5 py-10 text-center sm:px-6 sm:py-12">
        <Logo href="/" size="md" />

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Built with Follio</p>
          <p className="text-sm text-muted-foreground">Own your first impression</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Get started
          </Link>
        </div>
      </div>
    </footer>
  );
}
