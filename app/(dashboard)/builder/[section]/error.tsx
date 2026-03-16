'use client';

import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Builder Section Error Boundary
 *
 * Catches errors in the section editor and provides recovery options.
 * Common causes: stale DB connections, auth session expiry, transient
 * server errors during navigation.
 */
export default function BuilderSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Builder Section Error]', error.message, error.stack);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Failed to load section</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          This is usually a temporary issue. Try refreshing or navigating back.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
        <Button
          onClick={() => router.push('/builder/basic-info')}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Go to Header
        </Button>
      </div>
      {process.env.NODE_ENV === 'development' && error.message && (
        <pre className="mt-4 max-w-lg overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
          {error.digest && `\nDigest: ${error.digest}`}
        </pre>
      )}
    </div>
  );
}
