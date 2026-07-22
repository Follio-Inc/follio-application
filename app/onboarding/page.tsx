import { redirect } from 'next/navigation';

/**
 * Onboarding entry point - redirects to the import flow
 *
 * Flow:
 * 1. /onboarding/purpose - Select your main purpose (optional)
 * 2. /onboarding/import - Upload resume, connect accounts, then create profile
 * 3. /builder - Edit the resume (no separate review step)
 */
export default function OnboardingPage() {
  // Redirect to the import flow (skipping purpose for now)
  redirect('/onboarding/import');
}
