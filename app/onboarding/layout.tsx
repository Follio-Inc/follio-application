'use client';

import { AppHeader } from '@/components/app-header';
import { UserMenu } from '@/components/auth/user-menu';
import { Logo } from '@/components/Logo';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Composes the canonical AppHeader so onboarding's chrome is
          visually identical to the dashboard, admin, and public-profile
          surfaces — no more height/blur/padding drift between routes. */}
      <AppHeader left={<Logo href="/" size="md" />} right={<UserMenu />} />

      {/* Main Content */}
      {children}
    </div>
  );
}
