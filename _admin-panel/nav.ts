/**
 * Admin-panel module registry.
 * Lives outside product code. App shell imports this for nav only.
 *
 * Modules stay independent — do not couple developer ↔ users.
 */

export type AdminPanelModuleId = 'overview' | 'developer' | 'platform' | 'users';

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
 * `developer` and `platform` are two surfaces on purpose (PLATFORM_TODO item 10):
 * the first Developer Platform stays live and unchanged while the new one is
 * built beside it, and only item 25 retires the old one.
 */
export const ADMIN_PANEL_NAV: AdminPanelNavItem[] = [
  {
    id: 'overview',
    href: '/admin',
    label: 'Overview',
    description: 'High-level platform stats',
  },
  {
    id: 'developer',
    href: '/admin/developer',
    label: 'Developer',
    description: 'Health, suites, Live QA, resume reader, smoke',
  },
  {
    id: 'platform',
    href: '/admin/platform',
    label: 'Platform',
    description: 'Developer Platform: coverage map, drift, tests, labs (replaces Developer)',
  },
  {
    id: 'users',
    href: '/admin/users',
    label: 'Users',
    description: 'User monitoring (existing admin users surface)',
  },
];
