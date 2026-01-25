import { redirect } from 'next/navigation';

/**
 * Onboarding entry point - redirects to the new step-by-step flow
 *
 * New flow:
 * 1. /onboarding/purpose - Select your main purpose (optional)
 * 2. /onboarding/import - Upload resume, connect GitHub, etc.
 * 3. /onboarding/review - Review and edit parsed data step by step
 * 4. /me - View your completed profile
 */
export default function OnboardingPage() {
  // Redirect to the new import flow (skipping purpose for now)
  redirect('/onboarding/import');
}
