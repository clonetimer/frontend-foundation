#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeCustomRegistry } from './custom-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ownPackage = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const exportNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function fail(message) { throw new Error(message); }
function rel(root, file) { return file.startsWith(root) ? file.slice(root.length + 1) : file; }

function parseVersion(value) {
  const match = semverPattern.exec(String(value));
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] } : undefined;
}
function compareVersion(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return 0;
}
export function versionRangeIncludes(range, version) {
  const actual = parseVersion(version);
  if (!actual) return false;
  if (range === '*' || range === 'latest') return true;
  const kind = range.startsWith('^') || range.startsWith('~') ? range[0] : '';
  const expected = parseVersion(kind ? range.slice(1) : range);
  if (!expected) return false;
  if (!kind) return compareVersion(actual, expected) === 0;
  if (compareVersion(actual, expected) < 0) return false;
  if (kind === '~') return actual.major === expected.major && actual.minor === expected.minor;
  if (expected.major > 0) return actual.major === expected.major;
  if (expected.minor > 0) return actual.major === 0 && actual.minor === expected.minor;
  return actual.major === 0 && actual.minor === 0 && actual.patch === expected.patch;
}

function sourceExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const token of match[1].split(',')) {
      const clean = token.trim().replace(/^type\s+/, '');
      const parts = clean.split(/\s+as\s+/);
      const exported = (parts[1] ?? parts[0])?.trim();
      if (exported && exportNamePattern.test(exported)) names.add(exported);
    }
  }
  return names;
}

function resolveExportPath(manifest, field) {
  const dot = manifest.exports?.['.'];
  if (typeof dot === 'string') return field === 'import' ? dot : undefined;
  if (!plainObject(dot)) return undefined;
  const value = dot[field];
  return typeof value === 'string' ? value : undefined;
}

function diagnostic(code, message, path) {
  return { code, severity: 'error', message, ...(path ? { path } : {}) };
}

export async function verifyDomainPackage(rootInput, options = {}) {
  const root = resolve(rootInput);
  const diagnostics = [];
  const packageFile = join(root, 'package.json');
  const registryFile = join(root, 'foundation.registry.json');
  if (!existsSync(packageFile)) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'Missing package.json.', 'package.json'));
  if (!existsSync(registryFile)) diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', 'Missing foundation.registry.json.', 'foundation.registry.json'));
  if (diagnostics.length) return { ok: false, root, diagnostics };

  let manifest;
  let registryInput;
  try { manifest = readJson(packageFile); }
  catch (error) { diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', `Invalid package.json: ${error instanceof Error ? error.message : String(error)}`, 'package.json')); }
  try { registryInput = readJson(registryFile); }
  catch (error) { diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', `Invalid foundation.registry.json: ${error instanceof Error ? error.message : String(error)}`, 'foundation.registry.json')); }
  if (!manifest || !registryInput) return { ok: false, root, diagnostics };

  if (typeof manifest.name !== 'string' || !packageNamePattern.test(manifest.name)) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'package.json name must be a valid npm package name.', 'package.json.name'));
  if (!parseVersion(manifest.version)) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'package.json version must be semantic version x.y.z.', 'package.json.version'));
  if (manifest.type !== 'module') diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'Domain component packages must set type=module.', 'package.json.type'));
  if (!resolveExportPath(manifest, 'import')) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'package.json exports["."].import is required.', 'package.json.exports'));
  if (!resolveExportPath(manifest, 'types')) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'package.json exports["."].types is required.', 'package.json.exports'));
  if (!manifest.peerDependencies?.react) diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'Domain component packages must declare React as a peer dependency.', 'package.json.peerDependencies.react'));
  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist') || !manifest.files.includes('foundation.registry.json')) diagnostics.push(diagnostic('DOMAIN_PACK_INVALID', 'package.json files must include dist and foundation.registry.json.', 'package.json.files'));

  let registry;
  try { registry = normalizeCustomRegistry(registryInput, { widgets: [] }); }
  catch (error) { diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', error instanceof Error ? error.message : String(error), 'foundation.registry.json')); }

  if (registry) {
    const exportNames = new Set();
    for (const definition of registry.definitions) {
      if (definition.package !== manifest.name) diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', `${definition.id} declares package ${definition.package}; expected ${String(manifest.name)}.`, `foundation.registry.json:${definition.id}.package`));
      if (!versionRangeIncludes(definition.version, manifest.version)) diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', `${definition.id} dependency range ${definition.version} does not include package version ${manifest.version}.`, `foundation.registry.json:${definition.id}.version`));
      if (exportNames.has(definition.exportName)) diagnostics.push(diagnostic('DOMAIN_REGISTRY_INVALID', `Duplicate exportName ${definition.exportName}.`, `foundation.registry.json:${definition.id}.exportName`));
      exportNames.add(definition.exportName);
    }

    const sourceIndex = join(root, 'src', 'index.ts');
    if (existsSync(sourceIndex)) {
      const exported = sourceExports(readFileSync(sourceIndex, 'utf8'));
      for (const definition of registry.definitions) if (!exported.has(definition.exportName)) diagnostics.push(diagnostic('DOMAIN_EXPORT_MISSING', `${definition.exportName} is not explicitly exported from src/index.ts.`, 'src/index.ts'));
    } else {
      diagnostics.push(diagnostic('DOMAIN_PACKAGE_INVALID', 'Missing src/index.ts.', 'src/index.ts'));
    }

    if (options.built || options.pack) {
      const importPath = resolveExportPath(manifest, 'import');
      if (importPath) {
        const builtEntry = resolve(root, importPath);
        if (!existsSync(builtEntry)) diagnostics.push(diagnostic('DOMAIN_EXPORT_MISSING', `Built entry ${rel(root, builtEntry)} does not exist. Run the package build before built/pack verification.`, importPath));
        else {
          try {
            const module = await import(`${pathToFileURL(builtEntry).href}?foundation-domain=${Date.now()}`);
            for (const definition of registry.definitions) if (!(definition.exportName in module)) diagnostics.push(diagnostic('DOMAIN_EXPORT_MISSING', `${definition.exportName} is missing from the built package entry.`, importPath));
          } catch (error) {
            diagnostics.push(diagnostic('DOMAIN_EXPORT_MISSING', `Built package entry could not be imported: ${error instanceof Error ? error.message : String(error)}`, importPath));
          }
        }
      }
    }
  }

  let packedFiles;
  if (options.pack) {
    try {
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const output = execFileSync(npmCommand, ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const payload = JSON.parse(output);
      packedFiles = new Set((payload[0]?.files ?? []).map((entry) => entry.path));
      for (const required of ['package.json', 'foundation.registry.json']) if (!packedFiles.has(required)) diagnostics.push(diagnostic('DOMAIN_PACK_INVALID', `npm pack would omit ${required}.`, required));
      for (const field of ['import', 'types']) {
        const target = resolveExportPath(manifest, field)?.replace(/^\.\//, '');
        if (target && !packedFiles.has(target)) diagnostics.push(diagnostic('DOMAIN_PACK_INVALID', `npm pack would omit exported ${field} file ${target}.`, target));
      }
    } catch (error) {
      diagnostics.push(diagnostic('DOMAIN_PACK_INVALID', `npm pack --dry-run failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  return { ok: diagnostics.length === 0, root, package: manifest.name, version: manifest.version, componentCount: registry?.definitions.length ?? 0, ...(packedFiles ? { packedFiles: [...packedFiles].sort() } : {}), diagnostics };
}

function normalizeNamespace(value) {
  const result = String(value).toLowerCase().replace(/^@/, '').replaceAll('/', '-').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z][a-z0-9-]*$/.test(result)) fail(`Invalid namespace: ${value}`);
  return result;
}

export function initDomainPackage(targetInput, options = {}) {
  const target = resolve(targetInput);
  const packageName = options.packageName ?? `@example/${basename(target).replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()}`;
  if (!packageNamePattern.test(packageName)) fail(`Invalid package name: ${packageName}`);
  const namespace = normalizeNamespace(options.namespace ?? packageName.split('/').at(-1) ?? 'domain');
  if (existsSync(target) && readdirSync(target).length && !options.force) fail(`Target directory is not empty: ${target}`);
  mkdirSync(join(target, 'src'), { recursive: true });
  const version = '0.1.0';
  writeJson(join(target, 'package.json'), {
    name: packageName,
    version,
    type: 'module',
    files: ['dist', 'foundation.registry.json', 'README.md'],
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    scripts: {
      build: 'tsc -p tsconfig.build.json',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      'domain:verify': 'foundation-domain verify . --pack'
    },
    peerDependencies: { react: '^19.0.0' },
    devDependencies: { '@foundation/create-app': `^${ownPackage.version}`, '@types/react': '^19.0.0', react: '^19.0.0', typescript: '~6.0.2' }
  });
  writeJson(join(target, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2023', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true,
      exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, isolatedModules: true, verbatimModuleSyntax: true, noEmit: true, skipLibCheck: true
    },
    include: ['src/**/*.ts', 'src/**/*.tsx']
  });
  writeJson(join(target, 'tsconfig.build.json'), {
    extends: './tsconfig.json',
    compilerOptions: { noEmit: false, declaration: true, declarationMap: true, outDir: 'dist', rootDir: 'src' },
    include: ['src/**/*.ts', 'src/**/*.tsx']
  });
  writeFileSync(join(target, 'src', 'DomainPanel.tsx'), `import type { ReactNode } from 'react';\n\nexport interface DomainPanelProps {\n  title: string;\n  active?: boolean;\n  children?: ReactNode;\n  onActivate?: (value: string) => void;\n}\n\nexport function DomainPanel({ title, active = false, children, onActivate }: DomainPanelProps) {\n  return (\n    <section data-domain-panel={active ? 'active' : 'idle'}>\n      <button type="button" onClick={() => onActivate?.(title)}>{title}</button>\n      <div>{children}</div>\n    </section>\n  );\n}\n`, 'utf8');
  writeFileSync(join(target, 'src', 'index.ts'), `export { DomainPanel } from './DomainPanel.js';\nexport type { DomainPanelProps } from './DomainPanel.js';\n`, 'utf8');
  writeJson(join(target, 'foundation.registry.json'), {
    schemaVersion: 1,
    blocks: [{
      id: `${namespace}.domain-panel`, package: packageName, version: `^${version}`, exportName: 'DomainPanel', description: 'Starter domain component with properties, binding, event, and child composition.', acceptsChildren: true,
      properties: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'active', label: 'Active', kind: 'boolean', default: false }],
      bindings: { title: 'string', active: 'boolean' }, events: { activate: { prop: 'onActivate', valueType: 'string', parameter: 'value' } }
    }]
  });
  writeFileSync(join(target, 'README.md'), `# ${packageName}\n\nGenerated by Frontend Foundation Domain Component SDK.\n\n## Workflow\n\n\`npm run typecheck\`\n\n\`npm run build\`\n\n\`npm run domain:verify\`\n\nThe package-level \`foundation.registry.json\` is also a project-compatible Custom Registry fragment.\n`, 'utf8');
  return { target, packageName, namespace };
}

function withoutCategory(entry) {
  const output = { ...entry };
  delete output.category;
  return output;
}

export function mergeDomainRegistries(files, outputFile) {
  const aggregate = { schemaVersion: 1, widgets: [], blocks: [] };
  for (const fileInput of files) {
    const file = resolve(fileInput);
    const parsed = normalizeCustomRegistry(readJson(file), { widgets: [] });
    aggregate.widgets.push(...parsed.widgets.map(withoutCategory));
    aggregate.blocks.push(...parsed.blocks.map(withoutCategory));
  }
  const normalized = normalizeCustomRegistry(aggregate, { widgets: [] });
  const clean = { schemaVersion: 1, ...(normalized.widgets.length ? { widgets: normalized.widgets.map(withoutCategory) } : {}), ...(normalized.blocks.length ? { blocks: normalized.blocks.map(withoutCategory) } : {}) };
  if (outputFile) writeJson(resolve(outputFile), clean);
  return clean;
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  while (rest.length) {
    const token = rest.shift();
    if (!token) continue;
    if (!token.startsWith('--')) { positional.push(token); continue; }
    const key = token.slice(2);
    if (['force', 'json', 'pack', 'built'].includes(key)) { options[key] = true; continue; }
    const value = rest.shift();
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    options[key] = value;
  }
  return { command, positional, options };
}

function usage() {
  return `foundation-domain\n\nCommands:\n  init <dir> [--package @scope/name] [--namespace name] [--force]\n  verify <dir> [--built] [--pack] [--json]\n  merge <registry...> --out foundation.registry.json [--json]\n`;
}

async function main() {
  const { command, positional, options } = parseCli(process.argv.slice(2));
  if (!command || command === 'help' || options.help) { console.log(usage()); return; }
  if (command === 'init') {
    if (!positional[0]) fail('init requires a target directory');
    const result = initDomainPackage(positional[0], { packageName: options.package, namespace: options.namespace, force: Boolean(options.force) });
    console.log(`Created domain component package ${result.packageName} at ${result.target}`);
    return;
  }
  if (command === 'verify') {
    const result = await verifyDomainPackage(positional[0] ?? '.', { built: Boolean(options.built), pack: Boolean(options.pack) });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else if (result.ok) console.log(`Domain component package verified: ${result.package}@${result.version} (${result.componentCount} components)`);
    else console.error(result.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('\n'));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === 'merge') {
    if (!positional.length) fail('merge requires one or more registry files');
    if (!options.out) fail('merge requires --out <file>');
    const result = mergeDomainRegistries(positional, options.out);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Merged ${positional.length} registries -> ${resolve(options.out)}`);
    return;
  }
  fail(`Unknown command: ${command}\n${usage()}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
