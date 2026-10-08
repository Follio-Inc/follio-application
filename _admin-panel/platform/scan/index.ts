export { covers, discoverProductSurface, scanProductSurface } from './surface';
export type { DiscoveredSurface, SurfaceScanOptions } from './surface';
export { discoverTestFiles, scanTestAttribution } from './tests';
export type { TestScanOptions } from './tests';
export {
  barrelTargets,
  createReferenceReader,
  extractModuleReferences,
  resolveModuleFile,
  toModuleKey,
} from './import-graph';
export type { ModuleReference, ModuleReferenceKind } from './import-graph';
export { formatDriftReport, runDriftScan } from './report';
export type { DriftScanOptions } from './report';
export type {
  DriftReport,
  DriftSignalReport,
  StaleTestReference,
  SurfaceClassification,
  SurfaceFinding,
  SurfaceKind,
  SurfaceScanReport,
  SurfaceScanSummary,
  TestAssertionStyle,
  TestClassification,
  TestFinding,
  TestScanReport,
  TestScanSummary,
} from './types';
