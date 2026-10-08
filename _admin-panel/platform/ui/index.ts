/**
 * Developer Platform UI (PLATFORM_TODO item 10).
 *
 * The app's route files import from here and do nothing else, so the platform's
 * markup stays outside `app/` as `.cursor/rules/admin-panel.mdc` requires.
 *
 * Nothing in this directory may import `platform/scan/` or a `node:` module:
 * the shell is a client component, and the scanners walk the filesystem.
 * `__tests__/platform-shell.test.ts` enforces it.
 */

export { PlatformOverview } from './platform-overview';
export { PlatformSectionPlaceholder } from './platform-section';
export { PlatformShell } from './platform-shell';
