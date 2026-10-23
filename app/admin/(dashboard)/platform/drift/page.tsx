import { buildDriftView, buildQuarantineView } from '@/_admin-panel/platform/drift';
import {
  DriftChangePanel,
  DriftQuarantinePanel,
  DriftReportView,
} from '@/_admin-panel/platform/ui';
import { getPlatformRole, hasPlatformPermission } from '@/_admin-panel/platform/auth';
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
  const admin = await requireAdmin();
  const role = await getPlatformRole(admin.adminId);
  const mayMaintain = role !== null && hasPlatformPermission(role, 'drift:quarantine');

  return (
    <DriftReportView
      view={buildDriftView()}
      changePanel={<DriftChangePanel />}
      quarantinePanel={
        <DriftQuarantinePanel
          view={(() => {
            const view = buildQuarantineView();
            // Item 28: maintainer only. A runner sees the findings and the
            // audit trail and no destructive controls; the three routes
            // refuse them anyway.
            return mayMaintain
              ? view
              : {
                  ...view,
                  canAct: false,
                  gateReason: `Quarantine, restore and delete are maintainer-only. Your Platform role is ${role ?? 'unavailable'}.`,
                };
          })()}
        />
      }
    />
  );
}
