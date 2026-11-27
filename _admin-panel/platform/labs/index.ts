/**
 * Labs module (PLATFORM_TODO item 20).
 *
 * All client-safe: the Labs home is derived from the coverage map and the
 * implementation registry, both of which are typed data. Nothing here reads
 * the filesystem, spawns anything or writes anything — item 20 is an index.
 */

export { IMPLEMENTED_LABS, LABS_ROOT, findLabImplementation } from './registry';
export { buildLabsView, labStatusFor } from './view';
export type { LabsViewOptions } from './view';
export type {
  LabCategory,
  LabFeature,
  LabImplementation,
  LabProblem,
  LabProblemKind,
  LabStatus,
  LabsSummary,
  LabsView,
} from './types';
