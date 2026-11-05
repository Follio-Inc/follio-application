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
  FlagFinding,
  FlagScanReport,
  FlagScanSummary,
  PartialGating,
  StaleFlagReference,
} from './types';

/**
 * Signal 5 of the drift scan: feature flags vs the coverage map.
 *
 * Flags are read out of `lib/features.ts` — the env vars that module touches,
 * and the exported helpers that touch them. No flag name appears in this file,
 * so a new flag helper is discovered on the next run and a removed one turns
 * every `flag` in the map that names it stale.
 *
 * Why the flag module and not every boolean env gate in the repo: a rule like
 * "`process.env.X === 'true'`" also matches `NODE_ENV`, `VERCEL` and
 * `LIVE_QA_HEADED`, and separating product flags from deployment discriminators
 * would take a hardcoded list of names — exactly what item 7 forbids. The flag
 * module is the repository's own answer to "what is a product flag". The known
 * consequence is that a gate declared elsewhere is outside this signal:
 * `lib/url.ts:33` reads `NEXT_PUBLIC_SUBDOMAIN_ENABLED` without a helper, so it
 * is not reported here. Moving it into `lib/features.ts` would bring it in.
 */

type LocalFunction = {
  name: string;
  exported: boolean;
  /** Env vars read directly in this function's body. */
  envReads: Set<string>;
  /** Other local functions this one calls. */
  calls: Set<string>;
};

/** One flag and the exported helpers that gate on it. */
export type FlagDeclaration = {
  flag: string;
  helpers: string[];
};

function isExported(node: ts.Node): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
  );
}

function isProcessEnvAccess(node: ts.Node): string | null {
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'process' &&
    node.expression.name.text === 'env'
  ) {
    return node.name.text;
  }
  return null;
}

/** Collects every env read and local call inside one function body. */
function describeBody(body: ts.Node, name: string, exported: boolean): LocalFunction {
  const envReads = new Set<string>();
  const calls = new Set<string>();

  const visit = (node: ts.Node): void => {
    const envName = isProcessEnvAccess(node);
    if (envName !== null) envReads.add(envName);

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(body);
  return { name, exported, envReads, calls };
}

/**
 * Flags declared by the flag module, each with the helpers that read it.
 *
 * Helper → flag is resolved transitively inside the module, because
 * `assertPortfolioEnabled` reads no env var itself: it calls
 * `isPortfolioEnabled`. A direct-reads-only rule would report the assert helper
 * as gating nothing and miss every API route that uses it.
 */
export function discoverFeatureFlags(repoRoot: string = process.cwd()): FlagDeclaration[] {
  const sourceText = readDefinitionSite(DEFINITION_SITES.featureFlags, repoRoot);
  if (sourceText === null) return [];

  const source = ts.createSourceFile(
    DEFINITION_SITES.featureFlags,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS
  );

  const functions = new Map<string, LocalFunction>();
  const moduleEnvReads = new Set<string>();

  const visit = (node: ts.Node): void => {
    const envName = isProcessEnvAccess(node);
    if (envName !== null) moduleEnvReads.add(envName);

    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const described = describeBody(node.body, node.name.text, isExported(node));
      functions.set(described.name, described);
      for (const flag of described.envReads) moduleEnvReads.add(flag);
      return;
    }

    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.length === 1 &&
      ts.isIdentifier(node.declarationList.declarations[0].name)
    ) {
      const declaration = node.declarationList.declarations[0];
      const initializer = declaration.initializer;
      if (
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ) {
        const described = describeBody(
          initializer.body,
          (declaration.name as ts.Identifier).text,
          isExported(node)
        );
        functions.set(described.name, described);
        for (const flag of described.envReads) moduleEnvReads.add(flag);
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  // Close over local calls so a helper that delegates still names its flag.
  const flagsOf = (name: string, seen = new Set<string>()): Set<string> => {
    const current = functions.get(name);
    if (!current || seen.has(name)) return new Set();
    seen.add(name);

    const reads = new Set(current.envReads);
    for (const called of current.calls) {
      for (const flag of flagsOf(called, seen)) reads.add(flag);
    }
    return reads;
  };

  const helpersByFlag = new Map<string, Set<string>>();
  for (const [name, described] of functions) {
    if (!described.exported) continue;
    for (const flag of flagsOf(name)) {
      helpersByFlag.set(flag, (helpersByFlag.get(flag) ?? new Set()).add(name));
    }
  }

  return [...moduleEnvReads]
    .sort()
    .map((flag) => ({ flag, helpers: [...(helpersByFlag.get(flag) ?? [])].sort() }));
}

export type FlagScanOptions = {
  /** Flag declarations to analyse. Defaults to reading the flag module. */
  flags?: FlagDeclaration[];
  features?: PlatformFeature[];
  sourceFacts?: SourceFacts;
  repoRoot?: string;
};

function findStaleReferences(
  features: PlatformFeature[],
  flags: Set<string>,
  inferredByFlag: Map<string, string[]>
): StaleFlagReference[] {
  const stale: StaleFlagReference[] = [];

  for (const feature of features) {
    if (!feature.flag) continue;

    if (!flags.has(feature.flag)) {
      stale.push({ featureId: feature.id, flag: feature.flag, reason: 'unknown-flag' });
    } else if (!(inferredByFlag.get(feature.flag) ?? []).includes(feature.id)) {
      stale.push({ featureId: feature.id, flag: feature.flag, reason: 'no-enforcement-link' });
    }
  }

  return stale.sort(
    (a, b) => a.featureId.localeCompare(b.featureId) || a.flag.localeCompare(b.flag)
  );
}

function summarize(findings: FlagFinding[], gatedFeatures: number): FlagScanSummary {
  return {
    total: findings.length,
    mapped: findings.filter((finding) => finding.classification === 'mapped').length,
    unclaimed: findings.filter((finding) => finding.classification === 'unclaimed').length,
    declared: findings.filter((finding) => finding.declaredFeatures.length > 0).length,
    unenforced: findings.filter((finding) => finding.enforcedIn.length === 0).length,
    gatedFeatures,
  };
}

const byFlag = (a: FlagFinding, b: FlagFinding) => a.flag.localeCompare(b.flag);

/** Compares the declared feature flags against the coverage map's `flag` fields. */
export function scanFeatureFlags(options: FlagScanOptions = {}): FlagScanReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const features = options.features ?? COVERAGE_MAP;
  const declarations = options.flags ?? discoverFeatureFlags(repoRoot);
  const facts = options.sourceFacts ?? collectSourceFacts({ repoRoot });

  const inferredByFlag = new Map<string, string[]>();
  const findings: FlagFinding[] = [...declarations]
    .sort((a, b) => a.flag.localeCompare(b.flag))
    .map(({ flag, helpers }) => {
      // Enforcement is either reading the env var or importing a helper that
      // does. The flag module itself is excluded: declaring a flag is not
      // gating anything on it.
      const direct = (facts.envReferences.get(flag) ?? []).filter(
        (file) => file !== DEFINITION_SITES.featureFlags
      );
      const viaHelper = helpers.flatMap((helper) =>
        (facts.importedBindings.get(`${DEFINITION_SITES.featureFlags}#${helper}`) ?? []).filter(
          (file) => file !== DEFINITION_SITES.featureFlags
        )
      );

      const enforcedIn = [...new Set([...direct, ...viaHelper])].sort();
      const inferredFeatures = featuresCovering(enforcedIn, features);
      const declaredFeatures = features
        .filter((feature) => feature.flag === flag)
        .map((feature) => feature.id)
        .sort();

      inferredByFlag.set(flag, inferredFeatures);

      return {
        flag,
        helpers,
        enforcedIn,
        inferredFeatures,
        declaredFeatures,
        // Same rule as signal 1: mapped means a feature's `codeLocations` cover
        // an enforcement site. Whether a feature also *declares* the flag is
        // the stricter statement, reported through `declaredFeatures` and
        // `partiallyGated`.
        classification: inferredFeatures.length > 0 ? 'mapped' : 'unclaimed',
      };
    });

  // A feature whose code gates on a flag it does not declare. Not drift: the
  // map's own rule is that `flag` means the *whole* feature is off, and
  // `public-follio` gates only its /work door. Recorded so partial gating is
  // visible instead of looking like an omission.
  const partiallyGated: PartialGating[] = findings
    .flatMap((finding) =>
      finding.inferredFeatures
        .filter((id) => !finding.declaredFeatures.includes(id))
        .map((featureId) => ({ featureId, flag: finding.flag }))
    )
    .sort((a, b) => a.featureId.localeCompare(b.featureId) || a.flag.localeCompare(b.flag));

  const pick = (classification: FlagFinding['classification']) =>
    findings.filter((finding) => finding.classification === classification).sort(byFlag);

  return {
    signal: 'feature-flags',
    summary: summarize(findings, features.filter((feature) => Boolean(feature.flag)).length),
    flags: [...findings].sort(byFlag),
    mapped: pick('mapped'),
    unclaimed: pick('unclaimed'),
    unenforced: findings.filter((finding) => finding.enforcedIn.length === 0).sort(byFlag),
    stale: findStaleReferences(
      features,
      new Set(declarations.map((declaration) => declaration.flag)),
      inferredByFlag
    ),
    partiallyGated,
  };
}
