import { redirect } from 'next/navigation';

/**
 * Data Sources is now part of Settings.
 * Redirect any bookmarks or stale links to the settings page.
 */
export default function DataSourcesPage() {
  redirect('/settings?tab=data-sources');
}
