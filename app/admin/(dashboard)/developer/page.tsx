import { DevtoolsPanel } from '@/_admin-panel/modules/developer/ui/DevtoolsPanel';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Developer - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. Real UI lives in `_admin-panel/modules/developer`.
 */
export default async function AdminDeveloperPage() {
  await requireAdmin();
  return <DevtoolsPanel />;
}
