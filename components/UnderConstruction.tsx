'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

interface UnderConstructionProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

export function UnderConstruction({
  title = 'Under Construction',
  description = "We're working hard to bring you this feature. Check back soon!",
  showBackButton = true,
  showHomeButton = true,
}: UnderConstructionProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo href="/" size="md" />
        </div>
      </nav>

      {/* Content */}
      <div className="flex flex-col items-center justify-center px-4 py-20">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mx-auto mb-10 max-w-md text-lg text-muted-foreground">{description}</p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {showBackButton && (
              <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Button>
            )}
            {showHomeButton && (
              <Link href="/">
                <Button>Back to Home</Button>
              </Link>
            )}
          </div>
        </div>

        <p className="mt-16 text-sm text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
