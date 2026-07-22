'use client';

import { OnboardingChrome } from '@/components/onboarding/onboarding-chrome';

/** Same chrome as /onboarding so lab previews match the product shell. */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <OnboardingChrome>{children}</OnboardingChrome>;
}
