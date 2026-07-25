import { redirect } from 'next/navigation';

/**
 * Legacy path: blank onboarding now lives at /onboarding/build.
 * Preserve query params (e.g. ?auto=1, ?step=experience).
 */
export default async function OnboardingReviewRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') query.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    }
  }
  const qs = query.toString();
  redirect(qs ? `/onboarding/build?${qs}` : '/onboarding/build');
}
