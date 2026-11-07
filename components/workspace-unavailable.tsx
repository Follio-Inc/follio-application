'use client';

import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Shown when an authenticated user's workspace cannot be read. This must stay
 * distinct from onboarding: a temporary database failure does not mean the
 * user has lost their resumes.
 */
export function WorkspaceUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4" role="alert">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          We couldn&apos;t load your workspace
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your resumes are still safe. Please try again in a moment.
        </p>
        <Button className="mt-6 gap-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </main>
  );
}
