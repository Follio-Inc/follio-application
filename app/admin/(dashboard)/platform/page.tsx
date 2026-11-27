import { PlatformOverview } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. Real UI lives in `_admin-panel/platform/ui`.
 */
export default async function AdminPlatformPage() {
  await requireAdmin();
  return <PlatformOverview />;
}
