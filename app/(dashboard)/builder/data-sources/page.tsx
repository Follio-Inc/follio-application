import { redirect } from 'next/navigation';

/**
 * Legacy route — redirects to the top-level Data Sources page.
 */
export default function DataSourcesPage() {
  redirect('/data-sources');
}
