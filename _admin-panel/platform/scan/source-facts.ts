import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { resolveModuleFile, toModuleKey } from './import-graph';

/**
 * One pass over the product source tree, collecting the raw facts the item-7
 * signals compare against the coverage map.
 *
 * Nothing here knows a single stage name, flag name or model name. What it
 * knows are *definition sites* — the module that declares the token budget, the
 * module that declares the flags, the schema file, and the shapes a reference
 * to one of them takes in source. The names themselves are always read out of
 * the repository, so adding a `MAX_TOKENS` key or a Prisma model changes the
 * report without anyone editing the scanner.
 *
 * Collected in a single pass because all three signals want facts about the
 * same ~670 files, and three separate walks would parse each of them three
 * times. `runDriftScan` builds this once and hands it to every signal; each
 * signal can still build its own, so it stays independently callable.
 *
 * Server-only: walks and parses files from disk.
 */

/**
 * Where the repository declares the things item 7 scans.
 *
 * These are anchors, not data. `stageBudgetSymbol` names the object literal to
 * read keys *from*; it does not name any key. If one of these moves, discovery
 * returns nothing and the signal says so rather than quietly passing — which is
 * why the tests assert each discovery is non-empty.
 */
export const DEFINITION_SITES = {
  /** Module declaring the per-stage AI token budget. */
  aiClient: 'lib/ai-client.ts',
  /** The `as const` object literal in `aiClient` whose keys are the AI stages. */
  stageBudgetSymbol: 'MAX_TOKENS',
  /** The AI call option whose string value names a stage. */
  stageOptionProperty: 'stage',
  /** Module declaring the product feature flags and their helpers. */
  featureFlags: 'lib/features.ts',
  /** The Prisma schema. */
  prismaSchema: 'prisma/schema.prisma',
} as const;

/**
 * Product source roots, walked for references.
 *
 * An allowlist rather than a denylist of non-source directories: `docs/`,
 * `scripts/`, `_experiments/` and the design samples are not shipped code, and
 * counting a reference in them as product usage would attribute a stage or a
 * model to code no user can reach. `__tests__` is excluded for the same reason —
 * a fixture naming a stage is not a feature using it.
 *
 * `_admin-panel` is excluded because the Developer Platform is operator tooling,
 * not product; a flag the platform reads for its own status page must not count
 * as product enforcement.
 *
 * The hole in an allowlist is a new top-level product directory nobody adds
 * here. `__tests__/platform-coverage-map.test.ts` closes it: every feature
 * `codeLocations` entry must sit under a scanned root.
 */
export const SOURCE_ROOTS = [
  '_extensions',
  'app',
  'components',
  'lib',
  'middleware.ts',
  'pdf-worker',
  'services',
  'types',
] as const;

/**
 * Prisma client query methods.
 *
 * Prisma's API surface, not this repository's data — the model names these are
 * called on all come from the schema. Listed so `thing.profile.label` (a field
 * read) is not mistaken for `prisma.profile.findMany()` (a model query).
 */
const PRISMA_QUERY_METHODS = new Set([
  'aggregate',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
]);

/** Raw references found in product source, each keyed by name. */
export type SourceFacts = {
  /** Files scanned, sorted. Empty means discovery found nothing — itself a bug. */
  files: string[];
  /**
   * Stage name → files naming it, sorted.
   *
   * Both forms count: a `stage: '…'` call option and a `MAX_TOKENS.<name>`
   * lookup. Keys not in the budget are kept too, so a call site naming a stage
   * with no budget is visible rather than dropped.
   */
  stageReferences: Map<string, string[]>;
  /** Env var name → files reading `process.env.<name>`, sorted. */
  envReferences: Map<string, string[]>;
  /**
   * Prisma delegate name → files calling `<expr>.<name>.<queryMethod>()`, sorted.
   *
   * Keyed by the delegate (`shareToken`), not the model (`ShareToken`); the
   * caller maps one to the other from the schema.
   */
  delegateReferences: Map<string, string[]>;
  /**
   * `<watched module>#<binding>` → files importing that binding, sorted.
   *
   * Only the watched modules are indexed. Resolving every import in the
   * repository would mean a filesystem probe per specifier for facts no signal
   * asks for.
   */
  importedBindings: Map<string, string[]>;
  /** Watched module path → files importing it in any form, sorted. */
  moduleImporters: Map<string, string[]>;
};

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** Every `.ts`/`.tsx` file under `SOURCE_ROOTS`, sorted. */
export function discoverSourceFiles(repoRoot: string = process.cwd()): string[] {
  const found: string[] = [];

  const walk = (relativePath: string): void => {
    const absolute = path.join(repoRoot, relativePath);
    if (!existsSync(absolute)) return;

    if (statSync(absolute).isFile()) {
      if (/\.tsx?$/.test(relativePath)) found.push(relativePath);
      return;
    }

    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name === 'node_modules') continue;
      walk(`${relativePath}/${entry.name}`);
    }
  };

  for (const root of SOURCE_ROOTS) walk(root);
  return found.sort();
}

function record(index: Map<string, string[]>, key: string, file: string): void {
  const files = index.get(key);
  if (!files) {
    index.set(key, [file]);
    return;
  }
  if (!files.includes(file)) files.push(file);
}

/** True for the `process.env` in `process.env.FOO`. */
function isProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'
  );
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Cheap text gate: could this file contain any fact we collect?
 *
 * Reading a file is unavoidable, but parsing one is not. Most of the ~670
 * source files are components that touch no env var, no AI stage, no Prisma
 * delegate and neither watched module, and building a syntax tree for them is
 * pure cost — enough of it that running the scan across parallel Vitest
 * workers was exhausting memory. Every marker below is something the visitor
 * needs to see in the text before it can match, so skipping a file with none
 * of them cannot change the result.
 */
function mightHoldFacts(sourceText: string, watchedHints: string[]): boolean {
  if (sourceText.includes('process.env')) return true;
  if (sourceText.includes(`${DEFINITION_SITES.stageOptionProperty}:`)) return true;
  if (sourceText.includes(DEFINITION_SITES.stageBudgetSymbol)) return true;

  for (const hint of watchedHints) {
    if (sourceText.includes(hint)) return true;
  }
  for (const method of PRISMA_QUERY_METHODS) {
    if (sourceText.includes(`.${method}(`)) return true;
  }

  return false;
}

/** The literal specifier of `import('…')`, or null for anything else. */
function dynamicImportSpecifier(node: ts.Node | undefined): string | null {
  if (
    node &&
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

/**
 * Resolves a specifier, but only when it names a watched module.
 *
 * The cheap test comes first: a key that cannot be one of the watched paths is
 * rejected before touching the filesystem, which matters because this runs on
 * every import in ~670 files.
 */
function resolveWatched(
  specifier: string,
  fromFile: string,
  repoRoot: string,
  watched: Set<string>
): string | null {
  const key = toModuleKey(specifier, fromFile);
  if (key === null) return null;
  if (!mightBeWatched(key, watched)) return null;

  const resolved = resolveModuleFile(key, repoRoot);
  return resolved !== null && watched.has(resolved) ? resolved : null;
}

/** True when a module key could resolve to a watched file. */
function mightBeWatched(moduleKey: string, watched: Set<string>): boolean {
  for (const target of watched) {
    if (
      target === moduleKey ||
      target.startsWith(`${moduleKey}.`) ||
      target.startsWith(`${moduleKey}/index.`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Harvests every fact from a file that has already been parsed.
 *
 * Separated from the reading and parsing so one pass over the tree can feed
 * this and the module graph from the same syntax tree. Parsing ~670 files
 * twice costs a second and a lot of transient allocation for no new
 * information.
 */
function collectFromSourceFile(
  source: ts.SourceFile,
  relativePath: string,
  facts: SourceFacts,
  repoRoot: string,
  watched: Set<string>
): void {
  const visit = (node: ts.Node): void => {
    // `process.env.NAME` and `process.env['NAME']`. A destructured
    // `const { NAME } = process.env` is not used in this repository and is not
    // handled; a flag read that way would show as unenforced, not as absent.
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      record(facts.envReferences, node.name.text, relativePath);
    }
    if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      record(facts.envReferences, node.argumentExpression.text, relativePath);
    }

    // `{ stage: 'narrativeGeneration' }` — the AI call option.
    if (
      ts.isPropertyAssignment(node) &&
      propertyNameText(node.name) === DEFINITION_SITES.stageOptionProperty &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      record(facts.stageReferences, node.initializer.text, relativePath);
    }

    // `MAX_TOKENS.narrativeGeneration` — a direct budget lookup. The literal
    // form only; `MAX_TOKENS[stage]` inside the client itself names no stage,
    // which is why the declaring module never counts as a usage site.
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === DEFINITION_SITES.stageBudgetSymbol
    ) {
      record(facts.stageReferences, node.name.text, relativePath);
    }

    // `prisma.shareToken.findMany(…)`, `tx.profile.update(…)`. The receiver's
    // own name is irrelevant — what identifies a model query is a delegate
    // from the schema carrying a Prisma query method.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      PRISMA_QUERY_METHODS.has(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      record(facts.delegateReferences, node.expression.expression.name.text, relativePath);
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = resolveWatched(node.moduleSpecifier.text, relativePath, repoRoot, watched);

      if (resolved !== null) {
        record(facts.moduleImporters, resolved, relativePath);

        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            // The local alias is irrelevant; the exported name is what links a
            // caller to the declaring module.
            const exported = (element.propertyName ?? element.name).text;
            record(facts.importedBindings, `${resolved}#${exported}`, relativePath);
          }
        }
      }
    }

    // `await import('@/lib/features')` — the module is imported even when the
    // call is lazy.
    const dynamicSpecifier = dynamicImportSpecifier(node);
    if (dynamicSpecifier !== null) {
      const resolved = resolveWatched(dynamicSpecifier, relativePath, repoRoot, watched);
      if (resolved !== null) record(facts.moduleImporters, resolved, relativePath);
    }

    // `const { isPortfolioEnabled } = await import('@/lib/features')`. The
    // repository gates on helpers both ways, and counting only the static form
    // would report a gated module as ungated.
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      const specifier = dynamicImportSpecifier(
        node.initializer && ts.isAwaitExpression(node.initializer)
          ? node.initializer.expression
          : node.initializer
      );
      const resolved =
        specifier === null ? null : resolveWatched(specifier, relativePath, repoRoot, watched);

      if (resolved !== null) {
        for (const element of node.name.elements) {
          const bound = element.propertyName ?? element.name;
          if (ts.isIdentifier(bound) || ts.isStringLiteral(bound)) {
            record(facts.importedBindings, `${resolved}#${bound.text}`, relativePath);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

export type SourceFactsOptions = {
  repoRoot?: string;
  /**
   * Files to read. Defaults to walking `SOURCE_ROOTS`.
   *
   * The seam tests use to feed a synthetic tree: point it at fixture files and
   * the facts come from those alone.
   */
  files?: string[];
  /**
   * Modules whose importers are indexed. Defaults to the definition sites.
   *
   * Every other import is skipped: no signal asks who imports `react`, and
   * resolving each one would cost a filesystem probe per specifier.
   */
  watchedModules?: string[];
};

/**
 * Full-tree facts, parsed once per process.
 *
 * Parsing ~670 files costs about a second and a lot of transient allocation,
 * and the three signals plus the report all want the same answer. Only the
 * default full-tree walk is cached, keyed by repo root — a call that names its
 * own `files` or `watchedModules` always reads fresh, which is what the
 * synthetic-tree tests rely on.
 *
 * The cache holds facts derived from disk, so a process that edits source
 * between scans must call `clearSourceFactsCache()`. Nothing in the scan does.
 */
const factsCache = new Map<string, SourceFacts>();

/** Drops the memoised full-tree facts. */
export function clearSourceFactsCache(): void {
  factsCache.clear();
}

/**
 * Stores facts gathered elsewhere under the full-tree key.
 *
 * `runDriftScan` parses the tree once and feeds both this and the module
 * graph; priming the cache means a later `collectSourceFacts()` in the same
 * process answers from that single pass instead of parsing again.
 */
export function cacheSourceFacts(repoRoot: string, facts: SourceFacts): void {
  factsCache.set(repoRoot, facts);
}

/** Reads the memoised facts without building them. */
export function peekSourceFacts(repoRoot: string): SourceFacts | undefined {
  return factsCache.get(repoRoot);
}

function emptyFacts(files: string[]): SourceFacts {
  return {
    files: [...files].sort(),
    stageReferences: new Map(),
    envReferences: new Map(),
    delegateReferences: new Map(),
    importedBindings: new Map(),
    moduleImporters: new Map(),
  };
}

/** Sorts every index, so two runs over one tree agree to the character. */
function sortFacts(facts: SourceFacts): SourceFacts {
  for (const index of [
    facts.stageReferences,
    facts.envReferences,
    facts.delegateReferences,
    facts.importedBindings,
    facts.moduleImporters,
  ]) {
    for (const [key, value] of index) index.set(key, [...value].sort());
  }

  return facts;
}

/** The last path segment of each watched module, e.g. `features`. */
function hintsFor(watched: Set<string>): string[] {
  return [...watched].map((modulePath) =>
    modulePath
      .split('/')
      .pop()!
      .replace(/\.tsx?$/, '')
  );
}

/**
 * A collector that takes files someone else has already parsed.
 *
 * The seam that lets `runDriftScan` walk the tree once: the module graph parses
 * each file and hands the syntax tree here, so both get what they need from one
 * pass. `accept` keeps the same cheap text gate as the standalone pass, so a
 * file with nothing to find costs a `String.includes` and no visitor walk.
 */
export type SourceFactsSink = {
  /** True once at least one file has been offered. */
  readonly used: boolean;
  accept(source: ts.SourceFile, relativePath: string, sourceText: string): void;
  /** Sorts and returns what was collected. */
  finish(files: string[]): SourceFacts;
};

export function createSourceFactsSink(options: SourceFactsOptions = {}): SourceFactsSink {
  const repoRoot = options.repoRoot ?? process.cwd();
  const watched = new Set(
    options.watchedModules ?? [DEFINITION_SITES.aiClient, DEFINITION_SITES.featureFlags]
  );
  const watchedHints = hintsFor(watched);
  const facts = emptyFacts([]);
  let used = false;

  return {
    get used() {
      return used;
    },
    accept(source, relativePath, sourceText) {
      used = true;
      if (!mightHoldFacts(sourceText, watchedHints)) return;
      collectFromSourceFile(source, relativePath, facts, repoRoot, watched);
    },
    finish(files) {
      facts.files = [...files].sort();
      return sortFacts(facts);
    },
  };
}

/** Collects every item-7 fact from product source in one pass. */
export function collectSourceFacts(options: SourceFactsOptions = {}): SourceFacts {
  const repoRoot = options.repoRoot ?? process.cwd();
  const cacheable = options.files === undefined && options.watchedModules === undefined;
  const cached = cacheable ? factsCache.get(repoRoot) : undefined;
  if (cached) return cached;

  const watched = new Set(
    options.watchedModules ?? [DEFINITION_SITES.aiClient, DEFINITION_SITES.featureFlags]
  );
  const watchedHints = hintsFor(watched);
  const files = options.files ?? discoverSourceFiles(repoRoot);
  const facts = emptyFacts(files);

  for (const relativePath of facts.files) {
    let sourceText: string;
    try {
      sourceText = readFileSync(path.join(repoRoot, relativePath), 'utf8');
    } catch {
      // An unreadable file contributes nothing rather than failing the scan.
      continue;
    }
    if (!mightHoldFacts(sourceText, watchedHints)) continue;

    const source = ts.createSourceFile(
      relativePath,
      sourceText,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      scriptKindFor(relativePath)
    );
    collectFromSourceFile(source, relativePath, facts, repoRoot, watched);
  }

  sortFacts(facts);
  if (cacheable) factsCache.set(repoRoot, facts);
  return facts;
}

/** Reads a definition site's text, or null when it is not where we expect. */
export function readDefinitionSite(relativePath: string, repoRoot: string): string | null {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}
