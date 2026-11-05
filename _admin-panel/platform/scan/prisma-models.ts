import { COVERAGE_MAP } from '../coverage-map';
import type { PlatformFeature } from '../coverage-map';
import { featuresCovering } from './surface';
import {
  DEFINITION_SITES,
  collectSourceFacts,
  readDefinitionSite,
  type SourceFacts,
} from './source-facts';
import type {
  PrismaModelFinding,
  PrismaScanReport,
  PrismaScanSummary,
  StalePrismaReference,
} from './types';

/**
 * Signal 6 of the drift scan: Prisma models vs the coverage map.
 *
 * Model names are read out of `prisma/schema.prisma`. No model name appears in
 * this file, so a migration that adds or removes a model is a visible diff in
 * the report, and a map reference to a dropped model goes stale.
 *
 * Read-only. The scan never writes the schema and never runs Prisma.
 *
 * Parsed with a line scan rather than the TypeScript AST because the schema is
 * not TypeScript and this repository has no Prisma schema parser as a
 * dependency — adding one for a `model X {` header would be a new dependency
 * for no gain. The scan is anchored to the `model` keyword at the start of a
 * line, which is the only place Prisma allows a model declaration.
 */

/** Model declarations in the schema, sorted. */
export function discoverPrismaModels(repoRoot: string = process.cwd()): string[] {
  const schema = readDefinitionSite(DEFINITION_SITES.prismaSchema, repoRoot);
  if (schema === null) return [];

  const models = new Set<string>();
  for (const line of schema.split(/\r?\n/)) {
    // Anchored at column 0: a commented-out or nested `model` is not a
    // declaration. `enum` and `type` blocks are not models and are skipped.
    const match = /^model\s+([A-Za-z_]\w*)\s*\{/.exec(line);
    if (match) models.add(match[1]);
  }

  return [...models].sort();
}

/**
 * The Prisma client property for a model.
 *
 * Prisma lowercases the first character and leaves the rest alone, which is why
 * `GitHubProfile` is reached as `gitHubProfile` and not `githubProfile`.
 */
export function delegateFor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export type PrismaScanOptions = {
  /** Model names to analyse. Defaults to reading the schema. */
  models?: string[];
  features?: PlatformFeature[];
  sourceFacts?: SourceFacts;
  repoRoot?: string;
};

function findStaleReferences(
  features: PlatformFeature[],
  models: Set<string>,
  inferredByModel: Map<string, string[]>
): StalePrismaReference[] {
  const stale: StalePrismaReference[] = [];

  for (const feature of features) {
    for (const model of feature.prismaModels ?? []) {
      if (!models.has(model)) {
        stale.push({ featureId: feature.id, model, reason: 'unknown-model' });
      } else if (!(inferredByModel.get(model) ?? []).includes(feature.id)) {
        stale.push({ featureId: feature.id, model, reason: 'no-usage-link' });
      }
    }
  }

  return stale.sort(
    (a, b) => a.featureId.localeCompare(b.featureId) || a.model.localeCompare(b.model)
  );
}

function summarize(findings: PrismaModelFinding[]): PrismaScanSummary {
  return {
    total: findings.length,
    mapped: findings.filter((finding) => finding.classification === 'mapped').length,
    unclaimed: findings.filter((finding) => finding.classification === 'unclaimed').length,
    declared: findings.filter((finding) => finding.declaredFeatures.length > 0).length,
    unused: findings.filter((finding) => finding.usedBy.length === 0).length,
  };
}

const byModel = (a: PrismaModelFinding, b: PrismaModelFinding) => a.model.localeCompare(b.model);

/** Compares the Prisma schema against the coverage map's declared models. */
export function scanPrismaModels(options: PrismaScanOptions = {}): PrismaScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const models = options.models ?? discoverPrismaModels(repoRoot);
  const facts = options.sourceFacts ?? collectSourceFacts({ repoRoot });

  const declaredByModel = new Map<string, string[]>();
  for (const feature of features) {
    for (const model of feature.prismaModels ?? []) {
      declaredByModel.set(model, [...(declaredByModel.get(model) ?? []), feature.id]);
    }
  }

  const inferredByModel = new Map<string, string[]>();
  const findings: PrismaModelFinding[] = [...models].sort().map((model) => {
    const delegate = delegateFor(model);
    const usedBy = facts.delegateReferences.get(delegate) ?? [];
    const inferredFeatures = featuresCovering(usedBy, features);
    const declaredFeatures = [...new Set(declaredByModel.get(model) ?? [])].sort();

    inferredByModel.set(model, inferredFeatures);

    return {
      model,
      delegate,
      usedBy,
      inferredFeatures,
      declaredFeatures,
      // Same rule as signal 1: mapped means a feature's `codeLocations` cover a
      // query site. `declaredFeatures` is the stricter statement, and the gap
      // between them is reported as `undeclared`.
      classification: inferredFeatures.length > 0 ? 'mapped' : 'unclaimed',
    };
  });

  const pick = (classification: PrismaModelFinding['classification']) =>
    findings.filter((finding) => finding.classification === classification).sort(byModel);

  return {
    signal: 'prisma-models',
    summary: summarize(findings),
    models: [...findings].sort(byModel),
    mapped: pick('mapped'),
    unclaimed: pick('unclaimed'),
    // No query in product source names this delegate. Not drift: a model can be
    // written only through a relation on another model, or read only by tooling
    // outside the scanned roots. It is the honest shortlist for item 8's
    // orphan work, not a delete list.
    unused: findings.filter((finding) => finding.usedBy.length === 0).sort(byModel),
    // Queried by a feature's own code, but named in no feature's
    // `prismaModels`. Expected for the shared tables — see the rule in
    // `map.ts` — and reported so the map's silence is visible as a choice.
    undeclared: findings
      .filter(
        (finding) => finding.inferredFeatures.length > 0 && finding.declaredFeatures.length === 0
      )
      .sort(byModel),
    stale: findStaleReferences(features, new Set(models), inferredByModel),
  };
}
