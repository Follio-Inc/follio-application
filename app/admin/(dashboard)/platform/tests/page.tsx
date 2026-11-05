import { canRunDeveloperSuites } from '@/_admin-panel/modules/developer/guard';
import { buildLiveQaCatalog } from '@/_admin-panel/modules/developer/live-qa';
import {
  buildHistoryView,
  buildTestInventory,
  isLiveQaAuthConfigured,
  listRunnableCategories,
  listRunnablePathways,
} from '@/_admin-panel/platform/tests';
import { LiveQaPanel, TestConsole, TestHistory, TestRunPanel } from '@/_admin-panel/platform/ui';
import { getPlatformRole, hasPlatformPermission } from '@/_admin-panel/platform/auth';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tests - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

const VITEST_GATE_REASON =
  'Spawning Vitest is local-only: it is refused in production and needs DEVTOOLS_ENABLED=true elsewhere. The inventory below is read-only and always available.';

const LIVE_QA_GATE_REASON =
  'Spawning Playwright is local-only: it is refused in production and needs DEVTOOLS_ENABLED=true elsewhere.';

/**
 * Thin shim. The inventory and both runners live in
 * `_admin-panel/platform/tests`; the views live in `_admin-panel/platform/ui`.
 */
export default async function AdminPlatformTestsPage() {
  const admin = await requireAdmin();

  // Item 28. The controls hide through the gate mechanism item 12 already
  // had, so there is one way a control disappears and one place that says
  // why. Hiding is courtesy: `/api/admin/platform/tests/*` checks the role
  // again and refuses a direct call regardless of what this renders.
  const role = await getPlatformRole(admin.adminId);
  const may = (permission: Parameters<typeof hasPlatformPermission>[1]) =>
    role !== null && hasPlatformPermission(role, permission);
  const roleReason = `Your Platform role is ${role ?? 'unavailable'}, which cannot start runs. A runner or maintainer can.`;

  return (
    <TestConsole
      inventory={buildTestInventory()}
      runPanel={
        <TestRunPanel
          categories={listRunnableCategories()}
          canRun={canRunDeveloperSuites() && may('tests:run')}
          gateReason={may('tests:run') ? VITEST_GATE_REASON : roleReason}
        />
      }
      liveQaPanel={
        <LiveQaPanel
          pathways={listRunnablePathways()}
          canRun={canRunDeveloperSuites() && may('live-qa:run')}
          gateReason={may('live-qa:run') ? LIVE_QA_GATE_REASON : roleReason}
          authConfigured={isLiveQaAuthConfigured()}
          baseUrl={buildLiveQaCatalog().defaults.baseUrl}
        />
      }
      historyPanel={
        <TestHistory
          view={buildHistoryView({
            categories: listRunnableCategories(),
            pathways: listRunnablePathways(),
          })}
        />
      }
    />
  );
}
