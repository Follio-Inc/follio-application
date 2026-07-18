'use client';

import { ArrowRight, Grid3X3 } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { isPortfolioEnabled } from '@/lib/features';
import { getPortfolioPath } from '@/lib/url';

interface PortfolioLinkBannerProps {
  profileHandle: string;
}

export function PortfolioLinkBanner({ profileHandle }: PortfolioLinkBannerProps) {
  if (!isPortfolioEnabled()) return null;

  return (
    <div className="border-b bg-muted/30">
      <div className="container flex items-center justify-center gap-3 py-2.5">
        <Grid3X3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Explore the full portfolio with projects, timeline, and more.
        </span>
        <Link href={getPortfolioPath(profileHandle)}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            View Portfolio
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
