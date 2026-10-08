import { PlatformShell } from '@/_admin-panel/platform/ui';

/**
 * Thin shim. The shell lives in `_admin-panel/platform/ui`.
 *
 * Chrome only — the admin auth check for this subtree is the `(dashboard)`
 * layout's, and each page below calls `requireAdmin()` as the rest of
 * `/admin` does.
 */
export default function AdminPlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
