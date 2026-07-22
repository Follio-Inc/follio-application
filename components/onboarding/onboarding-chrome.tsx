'use client';

import { AppHeader } from '@/components/app-header';
import { UserMenu } from '@/components/auth/user-menu';
import { Logo } from '@/components/Logo';

/**
 * Canonical onboarding chrome — same glass AppHeader + background shell
 * used by /onboarding and any preview pages that must match that look.
 */
export function OnboardingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader left={<Logo href="/" size="md" />} right={<UserMenu />} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
