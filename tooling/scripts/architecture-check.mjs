import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packageRoot = join(root, 'packages');
const allowed = {
  core: [],
  theme: ['core'],
  observability: ['core'],
  security: ['core'],
  api: ['core'],
  ui: ['core', 'theme'],
  data: ['core', 'ui'],
  forms: ['core'],
  file: [],
  async: ['core'],
  visualization: ['core', 'theme', 'ui'],
  app: ['core', 'theme', 'ui', 'api', 'security', 'observability'],
  testing: ['core', 'theme', 'ui', 'api', 'security', 'observability', 'data', 'forms', 'file', 'async', 'visualization', 'app']
};
const errors = [];
const manifests = new Map();
const ignoredDirs = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.consumer',
  'artifacts',
  '.git',
  '.vite',
  '.cache',
  'storybook-static'
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

for (const [name, allow] of Object.entries(allowed)) {
  const manifestPath = join(packageRoot, name, 'package.json');
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifests.set(name, pkg);

  const dependencyFields = ['dependencies', 'peerDependencies', 'devDependencies'];
  const foundationDeps = new Set(
    dependencyFields.flatMap((field) => Object.keys(pkg[field] ?? {}))
      .filter((dep) => dep.startsWith('@foundation/'))
      .map((dep) => dep.split('/').at(-1))
  );

  for (const target of foundationDeps) {
    if (target !== name && !allow.includes(target)) errors.push(`${name} must not declare dependency on ${target}`);
  }

  const files = walk(join(packageRoot, name)).filter((file) => /\.(ts|tsx)$/.test(file));
  const runtimeDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {})
  ]);
  const allDeps = new Set([...runtimeDeps, ...Object.keys(pkg.devDependencies ?? {})]);

  const packageNameOf = (specifier) => specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const importMatches = source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g);
    for (const match of importMatches) {
      const specifier = match[2];
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
      const importedPackage = packageNameOf(specifier);
      const isSource = relative(join(packageRoot, name), file).replaceAll('\\', '/').startsWith('src/');
      const declared = isSource ? runtimeDeps : allDeps;
      if (!declared.has(importedPackage)) {
        errors.push(`${name} imports undeclared ${isSource ? 'runtime' : 'development'} dependency ${importedPackage}: ${relative(root, file)}`);
      }

      if (!specifier.startsWith('@foundation/')) continue;
      const target = specifier.split('/')[1];
      if (specifier.includes('/src/')) errors.push(`deep import: ${relative(root, file)} -> ${specifier}`);
      if (target !== name && !allow.includes(target)) errors.push(`${name} source must not import ${target}: ${relative(root, file)}`);
      if (target !== name && !foundationDeps.has(target)) errors.push(`${name} imports undeclared Foundation package ${target}: ${relative(root, file)}`);
    }
  }
}

// Foundation package dependency cycle detection.
const graph = new Map(Object.keys(allowed).map((name) => {
  const pkg = manifests.get(name);
  const deps = Object.keys(pkg.dependencies ?? {})
    .filter((dep) => dep.startsWith('@foundation/'))
    .map((dep) => dep.split('/').at(-1));
  return [name, deps];
}));
const visiting = new Set();
const visited = new Set();
function visit(node, path = []) {
  if (visiting.has(node)) {
    errors.push(`Foundation dependency cycle: ${[...path, node].join(' -> ')}`);
    return;
  }
  if (visited.has(node)) return;
  visiting.add(node);
  for (const next of graph.get(node) ?? []) visit(next, [...path, node]);
  visiting.delete(node);
  visited.add(node);
}
for (const node of graph.keys()) visit(node);

const forbidden = ['diagnosis', 'training', 'customer', 'device', 'dataset', 'fault', 'experiment'];
for (const name of Object.keys(allowed)) {
  const sourceRoot = join(packageRoot, name, 'src');
  for (const file of walk(sourceRoot).filter((x) => /\.(ts|tsx)$/.test(x))) {
    const source = readFileSync(file, 'utf8');
    for (const word of forbidden) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(source)) errors.push(`business term "${word}" in ${relative(root, file)}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Architecture checks passed');
