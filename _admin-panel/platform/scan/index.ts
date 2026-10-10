export { covers, discoverProductSurface, featuresCovering, scanProductSurface } from './surface';
export type { DiscoveredSurface, SurfaceScanOptions } from './surface';
export { scanTestAttribution } from './tests';
export { TEST_ROOT, discoverTestFiles } from './test-files';
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
  ENTRY_BASENAMES,
  analyzeModuleSource,
  buildModuleGraph,
  clearModuleGraphCache,
  discoverEntryPoints,
  entryPointsAmong,
  importersOf,
  modulesUnder,
} from './module-graph';
export type {
  ImportEdge,
  ModuleAnalysis,
  ModuleGraph,
  ModuleGraphOptions,
  ModuleNode,
  ReexportEdge,
} from './module-graph';
export { scanReachability } from './reachability';
export type { ReachabilityScanOptions } from './reachability';
export { moveCandidatesFor, scanMapReferences } from './map-references';
export type { MapReferenceScanOptions } from './map-references';
export { scanCategoryHealth } from './categories';
export type { CategoryHealthOptions } from './categories';
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
  CategoryHealthFinding,
  CategoryHealthReport,
  CategoryHealthSummary,
  CategorySize,
  DriftReport,
  DriftSignalReport,
  FeatureContradiction,
  FlagFinding,
  FlagScanReport,
  FlagScanSummary,
  MapReferenceClassification,
  MapReferenceFinding,
  MapReferenceKind,
  MapReferenceScanReport,
  MapReferenceScanSummary,
  MoveCandidate,
  OwnershipClassification,
  PartialGating,
  PathwayClassification,
  PathwayFinding,
  PathwayScanReport,
  PathwayScanSummary,
  PrismaModelFinding,
  PrismaScanReport,
  PrismaScanSummary,
  ReachabilityDisagreement,
  ReachabilityRecordFinding,
  ReachabilityScanReport,
  ReachabilityScanSummary,
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
