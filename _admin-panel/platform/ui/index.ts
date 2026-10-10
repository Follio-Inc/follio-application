/**
 * Developer Platform UI (PLATFORM_TODO item 10).
 *
 * The app's route files import from here and do nothing else, so the platform's
 * markup stays outside `app/` as `.cursor/rules/admin-panel.mdc` requires.
 *
 * Nothing in this directory may import `platform/scan/` or a `node:` module:
 * the shell is a client component, and the scanners walk the filesystem. A
 * component that needs repository data takes it as a prop and imports only the
 * **types** of whatever produced it — `TestConsole` is the first of those.
 * `__tests__/platform-shell.test.tsx` enforces the rule.
 */

export { PlatformOverview } from './platform-overview';
export { PlatformSectionPlaceholder } from './platform-section';
export { PlatformShell } from './platform-shell';
export { TestConsole } from './test-console';
