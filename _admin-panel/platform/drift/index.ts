/**
 * Drift page module (PLATFORM_TODO item 17).
 *
 * `view.ts` is **server-only**: it calls the scanner, which walks the
 * repository and parses it with the TypeScript compiler. `view-types.ts` is
 * client-safe, and `platform/ui/drift-report.tsx` imports only that.
 *
 * There is no second scanner here and no second opinion about what drift is:
 * the view is a projection of the existing typed `DriftReport`, and its `ok`
 * is the scanner's own.
 */

export { buildDriftView, toDriftView, FAILING_GROUPS, REGISTERED_GROUPS } from './view';
export type { DriftViewOptions } from './view';
export type {
  DriftCategoryRow,
  DriftCount,
  DriftEntry,
  DriftFindingGroup,
  DriftSeverity,
  DriftSignalView,
  DriftSummary,
  DriftView,
} from './view-types';
