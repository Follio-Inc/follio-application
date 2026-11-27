import { buildLabsView } from '@/_admin-panel/platform/labs';
import { LabsHome } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Labs - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. The view is derived in `_admin-panel/platform/labs`; the markup
 * lives in `_admin-panel/platform/ui`.
 */
export default async function AdminPlatformLabsPage() {
  await requireAdmin();
  return <LabsHome view={buildLabsView()} />;
}
