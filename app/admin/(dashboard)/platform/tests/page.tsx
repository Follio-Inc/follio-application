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
  await requireAdmin();

  return (
    <TestConsole
      inventory={buildTestInventory()}
      runPanel={
        <TestRunPanel
          categories={listRunnableCategories()}
          canRun={canRunDeveloperSuites()}
          gateReason={VITEST_GATE_REASON}
        />
      }
      liveQaPanel={
        <LiveQaPanel
          pathways={listRunnablePathways()}
          canRun={canRunDeveloperSuites()}
          gateReason={LIVE_QA_GATE_REASON}
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
