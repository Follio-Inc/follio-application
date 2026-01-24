'use client';

import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('[Error Boundary] Error caught:', error);
    console.error('[Error Boundary] Error message:', error.message);
    console.error('[Error Boundary] Error stack:', error.stack);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Something went wrong!</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <Button onClick={() => reset()}>Try again</Button>
      <Button variant="outline" onClick={() => (window.location.href = '/')}>
        Go home
      </Button>
    </div>
  );
}
