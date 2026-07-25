import { redirect } from 'next/navigation';

/**
 * Onboarding entry point - redirects to the import flow
 *
 * Flow:
 * 1. /onboarding/import — choose blank or upload resume
 * 2a. blank → /onboarding/build?step=… (guided profile → contact → experience → …)
 * 2b. upload → /builder (with construction reveal)
 *
 * Photo and connect account steps remain in the import page code but are not in the active path.
 * /onboarding/review redirects to /onboarding/build for backwards compatibility.
 */
export default function OnboardingPage() {
  // Redirect to the import flow (skipping purpose for now)
  redirect('/onboarding/import');
}
