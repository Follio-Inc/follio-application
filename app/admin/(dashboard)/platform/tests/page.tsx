import { buildTestInventory } from '@/_admin-panel/platform/tests';
import { TestConsole } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tests - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. The inventory is built server-side in
 * `_admin-panel/platform/tests` and rendered by `_admin-panel/platform/ui`.
 */
export default async function AdminPlatformTestsPage() {
  await requireAdmin();
  return <TestConsole inventory={buildTestInventory()} />;
}
