/**
 * Test Console module (PLATFORM_TODO item 11).
 *
 * `inventory.ts` is **server-only** — it walks `__tests__`. `types.ts` is
 * client-safe, and the view imports only from it. A route shim builds the
 * inventory on the server and passes it down as a plain prop.
 */

export { buildTestInventory } from './inventory';
export type { TestInventoryOptions } from './inventory';
export type {
  CategoryTests,
  FeatureTests,
  PathwayEntry,
  TestFileEntry,
  TestInventory,
  TestInventorySummary,
  UnattributedReason,
  UnattributedTest,
} from './types';
