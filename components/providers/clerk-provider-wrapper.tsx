'use client';

import { ClerkProvider, useUser } from '@clerk/nextjs';
import { useEffect } from 'react';

interface ClerkProviderWrapperProps {
  children: React.ReactNode;
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  // #region agent log
  if (typeof window !== 'undefined') {
    (window as unknown as { __follioClerkUseUser?: typeof useUser }).__follioClerkUseUser = useUser;
  }
  useEffect(() => {
    const isIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    fetch('http://127.0.0.1:7254/ingest/fcf2bd3d-74c8-4090-ab73-f47f4b1cfce0', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a3be95' },
      body: JSON.stringify({
        sessionId: 'a3be95',
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'clerk-provider-wrapper.tsx:mount',
        message: 'ClerkProviderWrapper mounted',
        data: {
          pathname: window.location.pathname,
          isIframe,
          hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, []);
  // #endregion

  return <ClerkProvider>{children}</ClerkProvider>;
}
