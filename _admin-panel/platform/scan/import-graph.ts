import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/**
 * Import-graph resolution for the drift scan.
 *
 * Uses the TypeScript compiler API rather than line-based regex, as
 * PLATFORM_TODO item 5 requires, because this repository contains every awkward
 * form: multiline `import { … } from`, relative specifiers, `await import()`,
 * `vi.mock()`, and tests that read product source as text. A regex over lines
 * misses four of the five — the multiline case alone defeats it.
 *
 * Server-only: parses files from disk. Shared by the test-attribution signal
 * and available to later signals rather than being reimplemented per signal.
 */

/** How a file refers to another module. */
export type ModuleReferenceKind =
  | 'static-import'
  | 'export-from'
  | 'dynamic-import'
  | 'vi-mock'
  | 'source-text';

export type ModuleReference = {
  /** The specifier exactly as written, or the literal path for `source-text`. */
  specifier: string;
  kind: ModuleReferenceKind;
};

const TS_EXTENSIONS = ['.ts', '.tsx', '.d.ts'];

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** The callee name of a call expression, flattening `path.join` to `join`. */
function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isProcessCwdCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'process' &&
    node.expression.name.text === 'cwd'
  );
}

/**
 * Literal repo-relative paths a file reads as *text*.
 *
 * Matches `resolve(process.cwd(), '…')` / `join(process.cwd(), '…')`. The
 * literal argument is the discriminator: a test that passes a variable is
 * reading files it discovered (as the platform's own tests do) rather than
 * asserting on one named source file, and must not be labelled `source-text`.
 */
function sourceTextTargets(node: ts.CallExpression): string[] {
  const name = calleeName(node.expression);
  if (name !== 'resolve' && name !== 'join') return [];
  if (!node.arguments.some(isProcessCwdCall)) return [];

  return node.arguments.filter(ts.isStringLiteral).map((argument) => argument.text);
}

/**
 * Every module reference in a source file, via the AST.
 *
 * Deduplicated on `kind + specifier` and sorted, so two runs agree.
 */
export function extractModuleReferences(sourceText: string, fileName: string): ModuleReference[] {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKindFor(fileName)
  );

  const found: ModuleReference[] = [];
  const add = (specifier: string, kind: ModuleReferenceKind) => found.push({ specifier, kind });

  const visit = (node: ts.Node): void => {
    // `import … from '…'` — multiline clauses are a single node, so the shape
    // of the import statement is irrelevant here.
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, 'static-import');
    }

    // `export { … } from '…'` and `export * from '…'` — how barrels re-export.
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text, 'export-from');
    }

    if (ts.isCallExpression(node)) {
      // `await import('…')`
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text, 'dynamic-import');
      }

      // `vi.mock('…')` — a mock still means the test is about that module.
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'mock' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text, 'vi-mock');
      }

      for (const target of sourceTextTargets(node)) {
        add(target, 'source-text');
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  const unique = new Map(
    found.map((reference) => [`${reference.kind}:${reference.specifier}`, reference])
  );
  return [...unique.values()].sort(
    (a, b) => a.specifier.localeCompare(b.specifier) || a.kind.localeCompare(b.kind)
  );
}

/**
 * Turns a specifier into a repo-relative module key.
 *
 * Returns null for a bare package specifier — `vitest`, `react`, `@prisma/client`
 * are not part of this repository's graph.
 */
export function toModuleKey(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('@/')) return specifier.slice(2);
  if (specifier.startsWith('.')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  }
  return null;
}

/**
 * Resolves a module key to the repo-relative file that actually exists.
 *
 * Mirrors TypeScript's own order: exact file, then extensions, then
 * `<key>/index.*`. Returns null when nothing on disk matches, which is itself
 * worth reporting — it means a specifier points at something absent.
 */
export function resolveModuleFile(moduleKey: string, repoRoot: string): string | null {
  const absolute = (relativePath: string) => path.join(repoRoot, relativePath);

  if (existsSync(absolute(moduleKey)) && statSync(absolute(moduleKey)).isFile()) {
    return moduleKey;
  }

  for (const extension of TS_EXTENSIONS) {
    const candidate = `${moduleKey}${extension}`;
    if (existsSync(absolute(candidate))) return candidate;
  }

  for (const extension of TS_EXTENSIONS) {
    const candidate = `${moduleKey}/index${extension}`;
    if (existsSync(absolute(candidate))) return candidate;
  }

  return null;
}

/** Reads and parses a file's references, memoised per scan run. */
export function createReferenceReader(repoRoot: string = process.cwd()) {
  const cache = new Map<string, ModuleReference[]>();

  return (relativePath: string): ModuleReference[] => {
    const cached = cache.get(relativePath);
    if (cached) return cached;

    let references: ModuleReference[] = [];
    try {
      const sourceText = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      references = extractModuleReferences(sourceText, relativePath);
    } catch {
      // An unreadable file contributes nothing rather than failing the scan.
      references = [];
    }

    cache.set(relativePath, references);
    return references;
  };
}

/**
 * Modules a barrel re-exports, one hop deep.
 *
 * One hop on purpose: it is what makes `@/services/import` attribute to the
 * services behind it, and deeper walking belongs with the reachability work in
 * item 8 rather than here.
 */
export function barrelTargets(
  modulePath: string,
  readReferences: (relativePath: string) => ModuleReference[],
  repoRoot: string = process.cwd()
): string[] {
  const resolved = readReferences(modulePath)
    .filter((reference) => reference.kind === 'export-from')
    .map((reference) => toModuleKey(reference.specifier, modulePath))
    .filter((key): key is string => key !== null)
    .map((key) => resolveModuleFile(key, repoRoot))
    .filter((file): file is string => file !== null);

  return [...new Set(resolved)].sort();
}
