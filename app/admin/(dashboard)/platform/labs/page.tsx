import { PlatformSectionPlaceholder } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Labs - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. Routed and reachable, with no implementation yet — see
 * `_admin-panel/platform/nav.ts` for the milestone that fills it.
 */
export default async function AdminPlatformLabsPage() {
  await requireAdmin();
  return <PlatformSectionPlaceholder id="labs" />;
}
