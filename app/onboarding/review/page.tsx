import { redirect } from 'next/navigation';

/**
 * Review was removed from onboarding — the builder is the edit surface.
 * Keep this route as a redirect so mid-flow bookmarks still recover.
 */
export default function OnboardingReviewRedirect() {
  redirect('/onboarding/import');
}
