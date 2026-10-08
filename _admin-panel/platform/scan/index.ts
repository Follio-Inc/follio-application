export { covers, discoverProductSurface, featuresCovering, scanProductSurface } from './surface';
export type { DiscoveredSurface, SurfaceScanOptions } from './surface';
export { discoverTestFiles, scanTestAttribution } from './tests';
export type { TestScanOptions } from './tests';
export { discoverPathwaySpecs, scanLiveQaPathways, specPathFor } from './pathways';
export type { PathwayScanOptions } from './pathways';
export { discoverAiStages, scanAiStages } from './ai-stages';
export type { AiStageScanOptions } from './ai-stages';
export { discoverFeatureFlags, scanFeatureFlags } from './flags';
export type { FlagDeclaration, FlagScanOptions } from './flags';
export { delegateFor, discoverPrismaModels, scanPrismaModels } from './prisma-models';
export type { PrismaScanOptions } from './prisma-models';
export {
  DEFINITION_SITES,
  SOURCE_ROOTS,
  clearSourceFactsCache,
  collectSourceFacts,
  discoverSourceFiles,
  readDefinitionSite,
} from './source-facts';
export type { SourceFacts, SourceFactsOptions } from './source-facts';
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
  AiStageFinding,
  AiStageScanReport,
  AiStageScanSummary,
  DriftReport,
  DriftSignalReport,
  FlagFinding,
  FlagScanReport,
  FlagScanSummary,
  OwnershipClassification,
  PartialGating,
  PathwayClassification,
  PathwayFinding,
  PathwayScanReport,
  PathwayScanSummary,
  PrismaModelFinding,
  PrismaScanReport,
  PrismaScanSummary,
  StaleAiStageReference,
  StaleFlagReference,
  StalePathwayReference,
  StalePrismaReference,
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
