#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundationLibraryManifests, root } from './lib.mjs';

const snapshotFile = join(root, 'tooling', 'release', 'public-api.snapshot.json');
const require = createRequire(import.meta.url);
let cachedTypeScript;

function loadTypeScript() {
  if (cachedTypeScript) return cachedTypeScript;
  const candidates = ['typescript'];
  try {
    const globalRoot = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (globalRoot) candidates.push(join(globalRoot, 'typescript'));
  } catch {
    // A normal workspace install resolves the first candidate. The global
    // fallback only keeps repository API governance runnable in clean/offline
    // validation environments that already provide the TypeScript CLI.
  }

  for (const candidate of candidates) {
    try {
      cachedTypeScript = require(candidate);
      return cachedTypeScript;
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error('TypeScript is required for public API verification. Install workspace dependencies or provide a global TypeScript CLI.');
}

function resolveRelativeModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectBindingName(name, out) {
  const ts = loadTypeScript();
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) collectBindingName(element.name, out);
    }
  }
}

function isExported(node) {
  const ts = loadTypeScript();
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectExports(file, seen = new Set()) {
  const ts = loadTypeScript();
  const normalized = resolve(file);
  if (seen.has(normalized)) return new Set();
  seen.add(normalized);
  const text = readFileSync(normalized, 'utf8');
  const source = ts.createSourceFile(normalized, text, ts.ScriptTarget.Latest, true, normalized.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = new Set();

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text);
      } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolveRelativeModule(normalized, statement.moduleSpecifier.text);
        if (target) for (const name of collectExports(target, seen)) names.add(name);
      }
      continue;
    }

    if (!isExported(statement)) continue;
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) names.add('default');
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) collectBindingName(declaration.name, names);
      continue;
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      if (statement.name && ts.isIdentifier(statement.name)) names.add(statement.name.text);
    }
  }
  return names;
}

export function createPublicApiSnapshot() {
  const packages = {};
  for (const { manifest, dir } of foundationLibraryManifests()) {
    const entry = join(dir, 'src', 'index.ts');
    if (!existsSync(entry)) continue;
    packages[manifest.name] = [...collectExports(entry)].sort();
  }
  return { schemaVersion: 1, packages };
}

export function verifyPublicApiSnapshot() {
  if (!existsSync(snapshotFile)) return { errors: [`Missing ${relative(root, snapshotFile)}; run pnpm release:api -- --write`] };
  const expected = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  const actual = createPublicApiSnapshot();
  const errors = [];
  for (const name of new Set([...Object.keys(expected.packages ?? {}), ...Object.keys(actual.packages ?? {})])) {
    const before = expected.packages?.[name] ?? [];
    const after = actual.packages?.[name] ?? [];
    const removed = before.filter((item) => !after.includes(item));
    const added = after.filter((item) => !before.includes(item));
    if (removed.length) errors.push(`${name} removed public exports: ${removed.join(', ')}`);
    if (added.length) errors.push(`${name} added public exports: ${added.join(', ')}`);
  }
  return { errors, actual };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const snapshot = createPublicApiSnapshot();
  if (process.argv.includes('--write')) {
    writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    console.log(`Public API snapshot written to ${relative(root, snapshotFile)}`);
  } else {
    const result = verifyPublicApiSnapshot();
    if (result.errors.length) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log(`Public API snapshot verified (${Object.keys(snapshot.packages).length} packages)`);
    }
  }
}
