import { buildDriftView, buildQuarantineView } from '@/_admin-panel/platform/drift';
import { DriftQuarantinePanel, DriftReportView } from '@/_admin-panel/platform/ui';
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
 *
 * Item 19's panel is a client component, passed in as a slot. Its own requests
 * re-run the scan server-side before they touch anything, so what it acts on is
 * never what this render happened to see.
 */
export default async function AdminPlatformDriftPage() {
  await requireAdmin();

  return (
    <DriftReportView
      view={buildDriftView()}
      quarantinePanel={<DriftQuarantinePanel view={buildQuarantineView()} />}
    />
  );
}
