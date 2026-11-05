import { getPlatformRole } from '@/_admin-panel/platform/auth';
import { PlatformShell } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Thin shim. The shell lives in `_admin-panel/platform/ui`.
 *
 * Chrome only — the admin auth check for this subtree is the `(dashboard)`
 * layout's, and each page below calls `requireAdmin()` as the rest of
 * `/admin` does.
 *
 * Item 28 reads the Platform role here so the shell can show it once for the
 * whole subtree. It is display only: every privileged route checks the role
 * again for itself, because a badge is not authorization.
 */
export default async function AdminPlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const role = await getPlatformRole(admin.adminId);

  return <PlatformShell role={role}>{children}</PlatformShell>;
}
