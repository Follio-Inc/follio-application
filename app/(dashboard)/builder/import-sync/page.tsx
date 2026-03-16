import { redirect } from 'next/navigation';

/**
 * Legacy Import & Sync page — redirects to the unified Data Sources page.
 */
export default function ImportSyncPage() {
  redirect('/data-sources');
}
