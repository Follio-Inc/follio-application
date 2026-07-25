'use client';

import { OnboardingChrome } from '@/components/onboarding/onboarding-chrome';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingChrome>{children}</OnboardingChrome>;
}
