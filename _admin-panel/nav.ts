/**
 * Admin-panel module registry.
 * Lives outside product code. App shell imports this for nav only.
 *
 * Modules stay independent — do not couple developer ↔ users.
 */

export type AdminPanelModuleId = 'overview' | 'platform' | 'users';

export type AdminPanelNavItem = {
  id: AdminPanelModuleId;
  href: string;
  label: string;
  /** Short note for docs / future badges */
  description: string;
};

/**
 * Sidebar modules owned by `_admin-panel`.
 * Overview stays a thin admin home; Users still uses the existing `/admin/users` shim
 * until `modules/users` is implemented.
 *
 * `platform` is the Developer Platform. There was a second entry, `developer`,
 * while the new one was built beside the old panel; item 25 retired the panel
 * and removed the entry, so there is one canonical surface again.
 * `/admin/developer` still resolves — it redirects to `/admin/platform` — but
 * it is not a module, so it is not in the sidebar.
 */
export const ADMIN_PANEL_NAV: AdminPanelNavItem[] = [
  {
    id: 'overview',
    href: '/admin',
    label: 'Overview',
    description: 'High-level platform stats',
  },
  {
    id: 'platform',
    href: '/admin/platform',
    label: 'Platform',
    description: 'Developer Platform: coverage map, drift, tests, labs',
  },
  {
    id: 'users',
    href: '/admin/users',
    label: 'Users',
    description: 'User monitoring (existing admin users surface)',
  },
];
