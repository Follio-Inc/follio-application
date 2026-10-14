import { buildCostStatus } from '@/_admin-panel/platform/cost';
import { buildResumeLabView } from '@/_admin-panel/platform/labs/resume-import-ai';
import { getPlatformRole, hasPlatformPermission } from '@/_admin-panel/platform/auth';
import { ResumeLab } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Resume import lab - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. The run lives in `_admin-panel/platform/labs/resume-import-ai`;
 * the markup lives in `_admin-panel/platform/ui`.
 *
 * Item 28 folds the Platform role into the view's existing `canRun` gate, so
 * a viewer sees the lab and its fixtures and no run controls. The two run
 * routes check the role again — hiding a button is not authorization.
 */
export default async function AdminResumeImportLabPage() {
  const admin = await requireAdmin();
  const role = await getPlatformRole(admin.adminId);
  const mayRun = role !== null && hasPlatformPermission(role, 'labs:run');

  const view = buildResumeLabView();
  // Item 29. Read for every role: a viewer may see what the day has cost.
  const cost = buildCostStatus();

  return (
    <ResumeLab
      cost={cost}
      view={
        mayRun
          ? view
          : {
              ...view,
              canRun: false,
              gateReason: `Running the lab needs a runner or maintainer role. Yours is ${role ?? 'unavailable'}.`,
            }
      }
    />
  );
}
