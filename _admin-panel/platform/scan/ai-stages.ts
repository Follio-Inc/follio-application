import ts from 'typescript';

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
  AiStageFinding,
  AiStageScanReport,
  AiStageScanSummary,
  StaleAiStageReference,
} from './types';

/**
 * Signal 4 of the drift scan: AI stages vs the coverage map.
 *
 * The stage list is read out of `lib/ai-client.ts`'s `MAX_TOKENS` object
 * literal — no stage name appears anywhere in this file, so adding a key to the
 * budget shows up in the report on the next run and removing one turns every
 * map reference to it stale.
 *
 * What this signal deliberately does **not** do is treat a missing stage as a
 * missing feature. PLATFORM_TODO item 7 is explicit that a `MAX_TOKENS` key is
 * one input and never the gate: `jd-match` is a shipped AI feature that imports
 * no AI client at all, because its matching is lexical. So the gap list is built
 * from features whose code actually calls the AI client, and AI-category
 * features that call no client are reported separately as expected, not missing.
 */

/** Unwraps `{ … } as const` to the object literal underneath. */
function objectLiteralOf(node: ts.Expression | undefined): ts.ObjectLiteralExpression | null {
  if (!node) return null;
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return objectLiteralOf(node.expression);
  }
  return ts.isObjectLiteralExpression(node) ? node : null;
}

/**
 * The AI stage names, read from the budget declaration.
 *
 * Returns an empty list when the declaration is not where `DEFINITION_SITES`
 * says it is, which the tests assert against so a moved budget fails loudly
 * instead of reporting "no stages, no drift".
 */
export function discoverAiStages(repoRoot: string = process.cwd()): string[] {
  const sourceText = readDefinitionSite(DEFINITION_SITES.aiClient, repoRoot);
  if (sourceText === null) return [];

  const source = ts.createSourceFile(
    DEFINITION_SITES.aiClient,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS
  );

  const stages = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === DEFINITION_SITES.stageBudgetSymbol
    ) {
      const literal = objectLiteralOf(node.initializer);
      for (const property of literal?.properties ?? []) {
        const name = property.name;
        if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) stages.add(name.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return [...stages].sort();
}

export type AiStageScanOptions = {
  /** Stage names to analyse. Defaults to reading the budget declaration. */
  stages?: string[];
  features?: PlatformFeature[];
  /** Pre-collected source facts, so one pass serves every signal. */
  sourceFacts?: SourceFacts;
  repoRoot?: string;
};

/** Features declaring a stage the budget does not define, or one their code never calls. */
function findStaleReferences(
  features: PlatformFeature[],
  stages: Set<string>,
  inferredByStage: Map<string, string[]>
): StaleAiStageReference[] {
  const stale: StaleAiStageReference[] = [];

  for (const feature of features) {
    for (const stage of feature.aiStages ?? []) {
      if (!stages.has(stage)) {
        stale.push({ featureId: feature.id, stage, reason: 'unknown-stage' });
      } else if (!(inferredByStage.get(stage) ?? []).includes(feature.id)) {
        stale.push({ featureId: feature.id, stage, reason: 'no-usage-link' });
      }
    }
  }

  return stale.sort(
    (a, b) => a.featureId.localeCompare(b.featureId) || a.stage.localeCompare(b.stage)
  );
}

function summarize(
  findings: AiStageFinding[],
  aiFeatures: string[],
  aiFeaturesWithoutStage: string[]
): AiStageScanSummary {
  return {
    total: findings.length,
    mapped: findings.filter((finding) => finding.classification === 'mapped').length,
    unclaimed: findings.filter((finding) => finding.classification === 'unclaimed').length,
    declared: findings.filter((finding) => finding.declaredFeatures.length > 0).length,
    unused: findings.filter((finding) => finding.usedBy.length === 0).length,
    aiFeatures: aiFeatures.length,
    aiFeaturesWithoutStage: aiFeaturesWithoutStage.length,
  };
}

const byStage = (a: AiStageFinding, b: AiStageFinding) => a.stage.localeCompare(b.stage);

/** Compares the AI token budget against the coverage map's declared stages. */
export function scanAiStages(options: AiStageScanOptions = {}): AiStageScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const stages = options.stages ?? discoverAiStages(repoRoot);
  const facts = options.sourceFacts ?? collectSourceFacts({ repoRoot });

  const declaredByStage = new Map<string, string[]>();
  for (const feature of features) {
    for (const stage of feature.aiStages ?? []) {
      declaredByStage.set(stage, [...(declaredByStage.get(stage) ?? []), feature.id]);
    }
  }

  const inferredByStage = new Map<string, string[]>();
  const findings: AiStageFinding[] = [...stages].sort().map((stage) => {
    const usedBy = facts.stageReferences.get(stage) ?? [];
    const inferredFeatures = featuresCovering(usedBy, features);
    const declaredFeatures = [...new Set(declaredByStage.get(stage) ?? [])].sort();

    inferredByStage.set(stage, inferredFeatures);

    return {
      stage,
      usedBy,
      inferredFeatures,
      declaredFeatures,
      // "Mapped" means the same thing it means in signal 1: some feature's
      // `codeLocations` account for it. `declaredFeatures` is a second, stricter
      // statement the map can make, and the gap between the two is reported
      // rather than folded into this classification.
      classification: inferredFeatures.length > 0 ? 'mapped' : 'unclaimed',
    };
  });

  // Which features call the AI client at all. This is the honest denominator
  // for "should have a stage": a feature that never imports the client cannot
  // be missing a token budget.
  const clientImporters = facts.moduleImporters.get(DEFINITION_SITES.aiClient) ?? [];
  const aiFeatures = featuresCovering(clientImporters, features);
  const declaresAnyStage = new Set(
    features.filter((feature) => (feature.aiStages ?? []).length > 0).map((feature) => feature.id)
  );

  const aiFeaturesWithoutStage = aiFeatures.filter((id) => !declaresAnyStage.has(id)).sort();
  const aiFeaturesWithoutClient = features
    .filter((feature) => feature.category === 'AI' && !aiFeatures.includes(feature.id))
    .map((feature) => feature.id)
    .sort();

  const pick = (classification: AiStageFinding['classification']) =>
    findings.filter((finding) => finding.classification === classification).sort(byStage);

  return {
    signal: 'ai-stages',
    summary: summarize(findings, aiFeatures, aiFeaturesWithoutStage),
    stages: [...findings].sort(byStage),
    mapped: pick('mapped'),
    unclaimed: pick('unclaimed'),
    unused: findings.filter((finding) => finding.usedBy.length === 0).sort(byStage),
    // Owned by some feature's code, but named in no feature's `aiStages`. A
    // gap in the map's declarations, not a contradiction.
    undeclared: findings
      .filter(
        (finding) => finding.inferredFeatures.length > 0 && finding.declaredFeatures.length === 0
      )
      .sort(byStage),
    stale: findStaleReferences(features, new Set(stages), inferredByStage),
    // A call site naming a stage the budget does not define. Legal at runtime —
    // `resolveMaxTokens` falls back to the default — so informational, but it
    // means that call is running on an unbudgeted allowance.
    unbudgetedStages: [...facts.stageReferences.keys()]
      .filter((stage) => !stages.includes(stage))
      .sort(),
    aiFeaturesWithoutStage,
    aiFeaturesWithoutClient,
  };
}
