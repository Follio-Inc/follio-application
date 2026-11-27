import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import type { ReachabilityClass } from '../coverage-map';
import { resolveModuleFile, toModuleKey } from './import-graph';
import { discoverSourceFiles } from './source-facts';

/**
 * The repository's module graph, and item 3's three reachability classes
 * computed over it (PLATFORM_TODO item 8).
 *
 * Item 3 recorded five modules by hand. This derives the same judgement for
 * **every** module from the current tree, which is what item 8 asks for and
 * what makes the five records falsifiable rather than merely written down.
 *
 * The distinction that matters is between *being referenced* and *being used*:
 *
 * - `orphan` — no chain of references from any shipped entry point reaches it.
 *   Having an importer is not enough: when every importer is itself an orphan
 *   the module is transitively dead, which is exactly the
 *   `lib/resume-parser/` → `services/import/resume-openresume.service.ts` dead
 *   end item 3 found and item 8 must rediscover without being told.
 * - `module-reachable-call-unused` — a shipped entry point reaches it, usually
 *   through a barrel re-export, but no reachable consumer asks for any of its
 *   exports. Deleting the module changes what loads; deleting its exports
 *   changes nothing.
 * - `live` — a reachable consumer asks for at least one of its exports, or it
 *   is an entry point, which the framework calls.
 *
 * Why re-export edges do not count as use: `services/import/index.ts:12`
 * re-exports `resumeImportService` from `./resume.service`, and the one file
 * that imports that barrel (`app/api/import/links/route.ts:2`) asks only for
 * `linksImportService`. A scanner that treated a re-export as a call would
 * report `resume.service.ts` as live and lose the middle class entirely.
 * Requests are therefore propagated *through* barrels by name, not absorbed
 * by them.
 *
 * Why type-only references still count: `import type { X } from './types'` is
 * erased at runtime, so a module reached only that way is never evaluated —
 * but deleting it breaks the build, which is the question this scan exists to
 * answer. A type reference establishes reachability and counts as a use of the
 * named symbol.
 *
 * Server-only: reads and parses files from disk. Resolution reuses
 * `import-graph`'s `toModuleKey`/`resolveModuleFile` and discovery reuses
 * `source-facts`'s walker, so there is one implementation of each.
 */

/**
 * Next.js file conventions that the framework itself loads.
 *
 * Framework API, not this repository's data: these are the filenames Next.js
 * treats as entry points, and which ones exist is discovered. Listing the whole
 * set means a future `sitemap.ts` becomes an entry point with no edit here.
 */
export const ENTRY_BASENAMES = [
  'apple-icon',
  'default',
  'error',
  'global-error',
  'icon',
  'layout',
  'loading',
  'manifest',
  'not-found',
  'opengraph-image',
  'page',
  'robots',
  'route',
  'sitemap',
  'template',
  'twitter-image',
] as const;

/** The directory Next.js reads those conventions from. */
const ENTRY_ROOT = 'app';

/** Root modules the framework loads by name rather than by import. */
const ROOT_ENTRY_MODULES = ['instrumentation', 'middleware'] as const;

const basenameWithoutExtension = (filePath: string): string =>
  path.posix.basename(filePath).replace(/\.tsx?$/, '');

/**
 * Entry points among a set of files, sorted.
 *
 * Pure, so a test can hand it a synthetic file list. Declaration files are not
 * modules the framework loads.
 */
export function entryPointsAmong(files: string[]): string[] {
  const conventions = new Set<string>(ENTRY_BASENAMES);
  const rootModules = new Set<string>(ROOT_ENTRY_MODULES);

  return files
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => {
      const basename = basenameWithoutExtension(file);
      if (file.startsWith(`${ENTRY_ROOT}/`)) return conventions.has(basename);
      return !file.includes('/') && rootModules.has(basename);
    })
    .sort();
}

/** Every file Next.js loads as an entry point, sorted. */
export function discoverEntryPoints(repoRoot: string = process.cwd()): string[] {
  return entryPointsAmong(discoverSourceFiles(repoRoot));
}

/** A reference to another module, and what it asks of it. */
export type ImportEdge = {
  /** Specifier exactly as written. */
  specifier: string;
  /** Exported names requested, sorted. `default` for a default import. */
  names: string[];
  /** The whole namespace was taken, so per-symbol use is unknown. */
  namespace: boolean;
  /** Erased at runtime, still a build dependency. */
  typeOnly: boolean;
};

/** A pass-through re-export: a reference that is not itself a use. */
export type ReexportEdge = {
  specifier: string;
  /** `export { a as b } from 'm'` → `{ exported: 'b', local: 'a' }`. */
  named: { exported: string; local: string }[];
  /** `export * from 'm'`. */
  star: boolean;
  typeOnly: boolean;
};

export type ModuleAnalysis = {
  /** Names the module declares and exports itself, sorted. */
  ownExports: string[];
  imports: ImportEdge[];
  reexports: ReexportEdge[];
};

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : []).some(
    (modifier) => modifier.kind === kind
  );
}

const isExported = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.ExportKeyword);
const isDefault = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.DefaultKeyword);

/** Every name a binding introduces, including destructured ones. */
function boundNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) boundNames(element.name, into);
  }
}

/** The literal specifier of `import('…')` or `require('…')`, or null. */
function callSpecifier(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null;

  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
  if (!isDynamicImport && !isRequire) return null;

  const first = node.arguments[0];
  return first && ts.isStringLiteral(first) ? first.text : null;
}

/** What a file exports, what it asks of others, and what it merely passes on. */
export function analyzeModuleSource(sourceText: string, fileName: string): ModuleAnalysis {
  return analyzeSourceFile(parseSourceFile(sourceText, fileName));
}

/** Parses a file the way every pass in this scan parses it. */
function parseSourceFile(sourceText: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKindFor(fileName)
  );
}

/** What a file exports and references, from a tree someone else parsed. */
function analyzeSourceFile(source: ts.SourceFile): ModuleAnalysis {
  const ownExports = new Set<string>();
  const imports: ImportEdge[] = [];
  const reexports: ReexportEdge[] = [];

  const addImport = (edge: ImportEdge) => imports.push({ ...edge, names: [...edge.names].sort() });

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const specifier = node.moduleSpecifier.text;

      if (!clause) {
        // `import 'm'` — evaluated for its side effects, asks for nothing.
        addImport({ specifier, names: [], namespace: false, typeOnly: false });
      } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        addImport({
          specifier,
          names: [],
          namespace: true,
          typeOnly: clause.isTypeOnly,
        });
      } else {
        const names: string[] = [];
        if (clause.name) names.push('default');
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            // The local alias is irrelevant; the exported name is the link.
            names.push((element.propertyName ?? element.name).text);
          }
        }
        addImport({ specifier, names, namespace: false, typeOnly: clause.isTypeOnly });
      }
    }

    if (ts.isExportDeclaration(node)) {
      const specifier =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : null;

      if (specifier === null) {
        // `export { a, b as c }` — names this module owns, re-labelled.
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) ownExports.add(element.name.text);
        }
      } else if (node.exportClause && ts.isNamespaceExport(node.exportClause)) {
        // `export * as ns from 'm'` — a new export here, and the whole of `m`
        // is taken, so which of its symbols are used is unknowable.
        ownExports.add(node.exportClause.name.text);
        addImport({ specifier, names: [], namespace: true, typeOnly: node.isTypeOnly });
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        reexports.push({
          specifier,
          named: node.exportClause.elements.map((element) => ({
            exported: element.name.text,
            local: (element.propertyName ?? element.name).text,
          })),
          star: false,
          typeOnly: node.isTypeOnly,
        });
      } else {
        reexports.push({ specifier, named: [], star: true, typeOnly: node.isTypeOnly });
      }
    }

    if (ts.isExportAssignment(node)) ownExports.add('default');

    if (isExported(node)) {
      if (isDefault(node)) ownExports.add('default');

      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isModuleDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        ownExports.add(node.name.text);
      }

      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          boundNames(declaration.name, ownExports);
        }
      }
    }

    // `await import('m')` and `require('m')`. Both take the module whole: the
    // destructuring that follows is not always visible here, so this counts as
    // a namespace use rather than guessing at names.
    const dynamic = callSpecifier(node);
    if (dynamic !== null) {
      addImport({ specifier: dynamic, names: [], namespace: true, typeOnly: false });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return {
    ownExports: [...ownExports].sort(),
    imports,
    reexports,
  };
}

/** One module, and what the graph says about it. */
export type ModuleNode = {
  path: string;
  /** The framework loads this file by convention. */
  entryPoint: boolean;
  /** Modules it references, in any form, sorted. */
  references: string[];
  /** Modules that reference it, in any form, sorted. */
  importedBy: string[];
  reachability: ReachabilityClass;
  /**
   * Shortest chain from an entry point to this module, entry first.
   *
   * Empty for an orphan — that is the difference between `orphan` and
   * `module-reachable-call-unused` expressed as evidence rather than a label.
   */
  entryChain: string[];
  /** Export names a reachable consumer asks for, sorted. */
  usedExports: string[];
  /** A reachable consumer took the whole namespace. */
  namespaceUsed: boolean;
  /** Names this module declares and exports itself, sorted. */
  ownExports: string[];
};

export type ModuleGraph = {
  /** Entry points this graph was walked from, sorted. */
  entryPoints: string[];
  /** Every module path, sorted. Iteration order never depends on the walk. */
  paths: string[];
  modules: Map<string, ModuleNode>;
};

type RawModule = {
  path: string;
  analysis: ModuleAnalysis;
  /** Resolved import edges, external and unresolvable specifiers dropped. */
  imports: { target: string; names: string[]; namespace: boolean }[];
  reexports: { target: string; named: { exported: string; local: string }[]; star: boolean }[];
};

export type ModuleGraphOptions = {
  repoRoot?: string;
  /** Files to analyse. Defaults to walking the product source roots. */
  files?: string[];
  /** Entry points to walk from. Defaults to the Next.js conventions among `files`. */
  entryPoints?: string[];
  /**
   * Pre-read sources, keyed by repo-relative path.
   *
   * The seam a test uses to describe a whole synthetic repository without
   * writing files: anything named here is used instead of reading from disk.
   */
  sources?: Record<string, string>;
  /**
   * Called with every file this build parses, before it is discarded.
   *
   * How `runDriftScan` gets the item-7 source facts out of the same pass:
   * parsing the tree twice costs a second and a lot of transient allocation
   * for no new information. It never affects what this function returns, so a
   * build served from the cache simply never calls it.
   */
  onSourceFile?: (source: ts.SourceFile, relativePath: string, sourceText: string) => void;
};

/**
 * Full-tree graph, built once per process.
 *
 * Parsing ~670 files costs about a second, and both item-8 signals plus the
 * report want the same answer. Only the default full-tree build is cached,
 * keyed by repo root; a call that names its own `files`, `entryPoints` or
 * `sources` always rebuilds, which is what the synthetic-tree tests rely on.
 *
 * The cache holds facts derived from disk, so a process that edits source
 * between scans must call `clearModuleGraphCache()`. Nothing in the scan does.
 */
const graphCache = new Map<string, ModuleGraph>();

/** Drops the memoised full-tree graph. */
export function clearModuleGraphCache(): void {
  graphCache.clear();
}

/** Reads the memoised graph without building it. */
export function peekModuleGraph(repoRoot: string): ModuleGraph | undefined {
  return graphCache.get(repoRoot);
}

/** Builds the module graph and classifies every module into item 3's classes. */
export function buildModuleGraph(options: ModuleGraphOptions = {}): ModuleGraph {
  const repoRoot = options.repoRoot ?? process.cwd();
  const cacheable =
    options.files === undefined &&
    options.entryPoints === undefined &&
    options.sources === undefined;
  const cached = cacheable ? graphCache.get(repoRoot) : undefined;
  if (cached) return cached;

  const files = (options.files ?? discoverSourceFiles(repoRoot))
    // Declaration files are type artifacts, never evaluated and never deletable
    // on their own evidence.
    .filter((file) => !file.endsWith('.d.ts'))
    .sort();
  const known = new Set(files);
  const sources = options.sources;

  const raw = new Map<string, RawModule>();
  for (const file of files) {
    let sourceText = sources?.[file];
    if (sourceText === undefined) {
      try {
        sourceText = readFileSync(path.join(repoRoot, file), 'utf8');
      } catch {
        // An unreadable file contributes no edges rather than failing the scan.
        sourceText = '';
      }
    }

    const source = parseSourceFile(sourceText, file);
    options.onSourceFile?.(source, file, sourceText);
    const analysis = analyzeSourceFile(source);

    // A specifier is only an edge when it resolves to a file in this graph:
    // packages and anything outside the scanned roots are somebody else's.
    const resolve = (specifier: string): string | null => {
      const key = toModuleKey(specifier, file);
      if (key === null) return null;
      const resolved = sources ? resolveAmong(key, known) : resolveModuleFile(key, repoRoot);
      return resolved !== null && known.has(resolved) ? resolved : null;
    };

    const imports: RawModule['imports'] = [];
    for (const edge of analysis.imports) {
      const target = resolve(edge.specifier);
      if (target !== null && target !== file) {
        imports.push({ target, names: edge.names, namespace: edge.namespace });
      }
    }

    const reexports: RawModule['reexports'] = [];
    for (const edge of analysis.reexports) {
      const target = resolve(edge.specifier);
      if (target !== null && target !== file) {
        reexports.push({ target, named: edge.named, star: edge.star });
      }
    }

    raw.set(file, { path: file, analysis, imports, reexports });
  }

  const references = new Map<string, Set<string>>();
  const importers = new Map<string, Set<string>>();
  for (const module of raw.values()) {
    const targets = new Set<string>([
      ...module.imports.map((edge) => edge.target),
      ...module.reexports.map((edge) => edge.target),
    ]);
    references.set(module.path, targets);
    for (const target of targets) {
      importers.set(target, (importers.get(target) ?? new Set()).add(module.path));
    }
  }

  const entryPoints = (options.entryPoints ?? entryPointsAmong(files))
    .filter((entry) => known.has(entry))
    .sort();

  // Breadth-first from the entry points, so `entryChain` is a shortest chain.
  // Inputs are sorted and neighbours are visited in sorted order, so the chain
  // chosen for a module never depends on the walk.
  const chains = new Map<string, string[]>();
  const queue: string[] = [];
  for (const entry of entryPoints) {
    if (!chains.has(entry)) {
      chains.set(entry, [entry]);
      queue.push(entry);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const chain = chains.get(current)!;
    for (const target of [...(references.get(current) ?? [])].sort()) {
      if (chains.has(target)) continue;
      chains.set(target, [...chain, target]);
      queue.push(target);
    }
  }

  // Which exports does anyone actually ask for? Seeded from reachable modules'
  // import edges only, then propagated through re-export barrels by name.
  const requested = new Map<string, Set<string>>();
  const namespaceUsed = new Set<string>();
  const exportSets = new Map<string, Set<string>>();

  const exportsOf = (modulePath: string, seen = new Set<string>()): Set<string> => {
    const memo = exportSets.get(modulePath);
    if (memo) return memo;
    if (seen.has(modulePath)) return new Set();
    seen.add(modulePath);

    const module = raw.get(modulePath);
    const names = new Set<string>(module?.analysis.ownExports ?? []);
    for (const edge of module?.reexports ?? []) {
      if (edge.star) {
        for (const name of exportsOf(edge.target, seen)) names.add(name);
      } else {
        for (const entry of edge.named) names.add(entry.exported);
      }
    }

    if (seen.size === 1) exportSets.set(modulePath, names);
    return names;
  };

  const pending: { modulePath: string; name: string | null }[] = [];
  const request = (modulePath: string, name: string): void => {
    if (!raw.has(modulePath)) return;
    const names = requested.get(modulePath) ?? new Set<string>();
    if (names.has(name)) return;
    names.add(name);
    requested.set(modulePath, names);
    pending.push({ modulePath, name });
  };
  const requestAll = (modulePath: string): void => {
    if (!raw.has(modulePath) || namespaceUsed.has(modulePath)) return;
    namespaceUsed.add(modulePath);
    pending.push({ modulePath, name: null });
  };

  for (const module of raw.values()) {
    if (!chains.has(module.path)) continue;
    for (const edge of module.imports) {
      if (edge.namespace) requestAll(edge.target);
      for (const name of edge.names) request(edge.target, name);
    }
  }

  for (let head = 0; head < pending.length; head += 1) {
    const { modulePath, name } = pending[head];
    const module = raw.get(modulePath);
    if (!module) continue;

    if (name === null) {
      // The whole namespace was taken, so everything it passes on is in use.
      for (const edge of module.reexports) {
        if (edge.star) requestAll(edge.target);
        else for (const entry of edge.named) request(edge.target, entry.local);
      }
      continue;
    }

    // Satisfied here; nothing to pass on.
    if (module.analysis.ownExports.includes(name)) continue;

    for (const edge of module.reexports) {
      if (edge.star) {
        if (exportsOf(edge.target).has(name)) request(edge.target, name);
      } else {
        for (const entry of edge.named) {
          if (entry.exported === name) request(edge.target, entry.local);
        }
      }
    }
  }

  const modules = new Map<string, ModuleNode>();
  for (const file of files) {
    const entryChain = chains.get(file) ?? [];
    const reachable = entryChain.length > 0;
    const used = [...(requested.get(file) ?? [])].sort();
    const takesNamespace = namespaceUsed.has(file);
    const entryPoint = entryPoints.includes(file);

    const reachability: ReachabilityClass = !reachable
      ? 'orphan'
      : // An entry point is called by the framework, not by an importer.
        entryPoint || takesNamespace || used.length > 0
        ? 'live'
        : 'module-reachable-call-unused';

    modules.set(file, {
      path: file,
      entryPoint,
      references: [...(references.get(file) ?? [])].sort(),
      importedBy: [...(importers.get(file) ?? [])].sort(),
      reachability,
      entryChain,
      usedExports: used,
      namespaceUsed: takesNamespace,
      ownExports: raw.get(file)?.analysis.ownExports ?? [],
    });
  }

  const graph: ModuleGraph = { entryPoints, paths: files, modules };
  if (cacheable) graphCache.set(repoRoot, graph);
  return graph;
}

/**
 * Resolves a module key against a known file set, without touching disk.
 *
 * Mirrors `resolveModuleFile`'s order so a synthetic graph behaves like a real
 * one. Used only when `sources` is given.
 */
function resolveAmong(moduleKey: string, known: Set<string>): string | null {
  if (known.has(moduleKey)) return moduleKey;
  for (const extension of ['.ts', '.tsx']) {
    if (known.has(`${moduleKey}${extension}`)) return `${moduleKey}${extension}`;
  }
  for (const extension of ['.ts', '.tsx']) {
    if (known.has(`${moduleKey}/index${extension}`)) return `${moduleKey}/index${extension}`;
  }
  return null;
}

/**
 * Graph modules under a recorded path, sorted.
 *
 * A record may name a file or a directory; a directory covers its subtree, so
 * `lib/resume-parser` answers for all eight of its modules.
 */
export function modulesUnder(graph: ModuleGraph, recordPath: string): string[] {
  return graph.paths.filter((file) => file === recordPath || file.startsWith(`${recordPath}/`));
}

/**
 * Files outside a recorded path's own subtree that reference it, sorted.
 *
 * Matches the definition item 3's records use, so the two can be compared: a
 * directory's internal imports are not importers of the directory.
 */
export function importersOf(graph: ModuleGraph, recordPath: string): string[] {
  const own = new Set(modulesUnder(graph, recordPath));
  const found = new Set<string>();

  for (const modulePath of own) {
    for (const importer of graph.modules.get(modulePath)?.importedBy ?? []) {
      if (!own.has(importer)) found.add(importer);
    }
  }

  return [...found].sort();
}
