'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { useEffect } from 'react';

import { warnIfClerkDevelopmentKeysInProduction } from '@/lib/clerk-env';

interface ClerkProviderWrapperProps {
  children: React.ReactNode;
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  useEffect(() => {
    warnIfClerkDevelopmentKeysInProduction();
  }, []);

  return <ClerkProvider>{children}</ClerkProvider>;
}
