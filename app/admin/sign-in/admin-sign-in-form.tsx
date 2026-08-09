'use client';

import { SignIn } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { Shield } from 'lucide-react';

export function AdminSignInForm() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10">
          <Shield className="h-6 w-6 text-orange-500" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">Administration</h1>
        <p className="mt-1 text-sm text-zinc-500">Authorized access only</p>
      </div>

      {/* Clerk SignIn — handles all verification flows */}
      <SignIn
        path="/admin/sign-in"
        routing="path"
        appearance={{
          baseTheme: dark,
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'bg-zinc-900 border border-zinc-800 shadow-2xl',
            socialButtonsBlockButton: 'hidden',
            socialButtonsBlockButtonArrow: 'hidden',
            dividerRow: 'hidden',
            footer: 'hidden',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            formButtonPrimary: 'bg-orange-600 hover:bg-orange-500 text-white',
          },
        }}
        forceRedirectUrl="/admin"
        signUpUrl="/admin/sign-in"
      />
    </div>
  );
}
