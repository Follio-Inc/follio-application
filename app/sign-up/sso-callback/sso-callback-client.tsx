'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallbackClient() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
        <div className="space-y-1">
          <p className="text-section-title">Creating your account</p>
          <p className="text-sm text-muted-foreground">This only takes a moment.</p>
        </div>
      </div>
      <AuthenticateWithRedirectCallback />
    </main>
  );
}
