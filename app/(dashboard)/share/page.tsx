import { redirect } from 'next/navigation';

/**
 * The standalone Share page has been removed.
 * Sharing is now handled per-resume from the resume cards.
 * Redirect any stale bookmarks to the resumes page.
 */
export default function SharePage() {
  redirect('/resumes');
}
