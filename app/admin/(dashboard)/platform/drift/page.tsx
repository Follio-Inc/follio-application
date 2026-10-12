import { buildDriftView } from '@/_admin-panel/platform/drift';
import { DriftReportView } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Drift - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. The scan and its projection live in
 * `_admin-panel/platform/drift`; the view lives in `_admin-panel/platform/ui`.
 *
 * The scan runs here, on the server, once per render — so a reload is a rescan
 * and nothing is cached where it could go stale without saying so.
 */
export default async function AdminPlatformDriftPage() {
  await requireAdmin();
  return <DriftReportView view={buildDriftView()} />;
}
