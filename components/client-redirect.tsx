'use client';

import { useEffect } from 'react';

import { Loading } from '@/components/ui/spinner';

/**
 * Full-document redirect with a visible holding state.
 *
 * Prefer this over next/navigation `redirect()` when the destination is
 * decided during a soft client navigation — App Router server redirects in
 * that case can collapse the UI to a blank page until a hard refresh.
 */
export function ClientRedirect({
  href,
  message = 'Redirecting…',
}: {
  href: string;
  message?: string;
}) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Loading text={message} size="md" />
    </div>
  );
}
