import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ignoredDirs = new Set(['node_modules', 'dist', 'coverage', '.consumer', 'artifacts', '.git', '.vite', '.cache', 'storybook-static']);
const errors = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const file = join(dir, entry);
    if (statSync(file).isDirectory()) out.push(...walk(file));
    else out.push(file);
  }
  return out;
}

function parseJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON ${relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const allFiles = walk(root);
for (const file of allFiles.filter((file) => extname(file) === '.json')) parseJson(file);

const packageDirs = [join(root, 'packages'), join(root, 'apps'), join(root, 'tooling')];
const manifests = [];
for (const base of packageDirs) {
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base)) {
    const manifestPath = join(base, entry, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = parseJson(manifestPath);
    if (manifest) manifests.push({ dir: join(base, entry), file: manifestPath, manifest });
  }
}

const names = new Map();
for (const { file, manifest } of manifests) {
  if (!manifest.name) errors.push(`Package without name: ${relative(root, file)}`);
  else if (names.has(manifest.name)) errors.push(`Duplicate package name ${manifest.name}: ${relative(root, file)} and ${relative(root, names.get(manifest.name))}`);
  else names.set(manifest.name, file);
}

const workspaceFoundationNames = new Set(
  manifests.map(({ manifest }) => manifest.name).filter((name) => typeof name === 'string' && name.startsWith('@foundation/'))
);

for (const { dir, file, manifest } of manifests) {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (typeof version !== 'string') errors.push(`${relative(root, file)} has non-string ${field}.${name}`);
      if (name.startsWith('@foundation/') && version === 'workspace:*' && !workspaceFoundationNames.has(name)) {
        errors.push(`${relative(root, file)} references unknown workspace package ${name}`);
      }
    }
  }

  if (!manifest.private && manifest.name?.startsWith('@foundation/')) {
    if (manifest.engines?.node !== '^22.13.0 || ^24.0.0') errors.push(`${manifest.name} must declare supported Node engines`);
    if (!existsSync(join(dir, 'README.md'))) errors.push(`${manifest.name} is missing README.md`);
    const isLibrary = dir.startsWith(join(root, 'packages'));
    if (isLibrary) {
      if (!existsSync(join(dir, 'src', 'index.ts'))) errors.push(`${manifest.name} is missing src/index.ts`);
      if (!manifest.exports?.['.']) errors.push(`${manifest.name} is missing package exports["."]`);
      if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) errors.push(`${manifest.name} must publish dist via files`);
    } else if (manifest.name === '@foundation/create-app') {
      if (manifest.private) errors.push('@foundation/create-app must be publishable');
      if (manifest.bin?.['create-foundation-app'] !== './index.mjs') errors.push('@foundation/create-app missing create-foundation-app bin');
      if (manifest.bin?.['foundation-doctor'] !== './doctor.mjs') errors.push('@foundation/create-app missing foundation-doctor bin');
      if (manifest.bin?.['foundation-upgrade'] !== './upgrade.mjs') errors.push('@foundation/create-app missing foundation-upgrade bin');
      if (manifest.bin?.['foundation-project'] !== './project.mjs') errors.push('@foundation/create-app missing foundation-project bin');
      if (manifest.bin?.['foundation-domain'] !== './domain-component.mjs') errors.push('@foundation/create-app missing foundation-domain bin');
      for (const required of ['index.mjs', 'doctor.mjs', 'upgrade.mjs', 'project.mjs', 'domain-component.mjs', 'visual-composition.mjs', 'interaction-model.mjs', 'project.schema.json', 'versions.json', 'profiles.json', 'composition.json', 'deployments.json', 'template', 'deployments']) {
        if (!manifest.files?.includes(required)) errors.push(`@foundation/create-app files missing ${required}`);
      }
      if (!existsSync(join(dir, 'template', 'gitignore.tmpl'))) errors.push('@foundation/create-app requires template/gitignore.tmpl so npm pack preserves generated .gitignore content');
      if (existsSync(join(dir, 'template', '.gitignore'))) errors.push('@foundation/create-app must not store generated .gitignore as template/.gitignore because npm pack omits it');
    }
  }
}

function moduleExists(base) {
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`,
    join(base, 'index.ts'), join(base, 'index.tsx')
  ];

  // TypeScript ESM source intentionally imports the emitted extension. Under
  // NodeNext/Bundler resolution, `./Widget.js` in source resolves to
  // `./Widget.ts`/`./Widget.tsx`, while `.mjs` and `.cjs` map to `.mts`/`.cts`.
  // Repository validation must understand that source-to-emitted mapping rather
  // than requiring generated JavaScript to exist inside src/.
  const extension = extname(base);
  const stem = extension ? base.slice(0, -extension.length) : base;
  if (extension === '.js') candidates.push(`${stem}.ts`, `${stem}.tsx`);
  if (extension === '.mjs') candidates.push(`${stem}.mts`);
  if (extension === '.cjs') candidates.push(`${stem}.cts`);

  return candidates.some(existsSync);
}

const sourceFiles = allFiles.filter((file) => /\.(ts|tsx)$/.test(file));
const importPattern = /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g;
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2];
    if (!specifier?.startsWith('.')) continue;
    if (!moduleExists(resolve(dirname(file), specifier))) {
      errors.push(`Unresolved relative import ${specifier} in ${relative(root, file)}`);
    }
  }
}

// Private apps must also declare every external package they import. Foundation package
// runtime-vs-dev rules are stricter and are enforced by architecture-check.mjs. Tooling scripts
// are excluded because consumer-test.mjs intentionally contains generated source-code strings.
const packageNameOf = (specifier) => specifier.startsWith('@')
  ? specifier.split('/').slice(0, 2).join('/')
  : specifier.split('/')[0];
for (const { dir, manifest } of manifests.filter(({ dir }) => dir.startsWith(join(root, 'apps')))) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);
  for (const file of walk(dir).filter((file) => /\.(ts|tsx|mts|cts|mjs)$/.test(file))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[2];
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
      const importedPackage = packageNameOf(specifier);
      if (!declared.has(importedPackage)) {
        errors.push(`${manifest.name ?? relative(root, dir)} imports undeclared dependency ${importedPackage}: ${relative(root, file)}`);
      }
    }
  }
}

for (const app of ['starter', 'showcase']) {
  const dir = join(root, 'apps', app);
  for (const required of ['index.html', 'public/runtime-config.json', 'src/main.tsx', 'src/app/application.ts']) {
    if (!existsSync(join(dir, required))) errors.push(`apps/${app} missing ${required}`);
  }
}

// Source trees must not contain generated JavaScript or source maps. This catches accidental
// tsc/transpiler output written back into Foundation source directories.
for (const { dir, manifest } of manifests) {
  if (!manifest.name?.startsWith('@foundation/')) continue;
  const sourceRoot = join(dir, 'src');
  if (!existsSync(sourceRoot)) continue;
  for (const file of walk(sourceRoot)) {
    if (/\.(js|cjs|mjs|map)$/.test(file)) {
      errors.push(`${manifest.name} source contains generated artifact ${relative(root, file)}`);
    }
  }
}

// Redis is intentionally outside the browser/runtime Foundation boundary. If a future
// BFF or service layer needs shared cache/session/rate-limit state, evaluate it there instead.
for (const { file, manifest } of manifests) {
  if (!manifest.name?.startsWith('@foundation/') || manifest.private) continue;
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name === 'redis' || name === 'ioredis' || name === '@redis/client') {
        errors.push(`${relative(root, file)} must not couple Frontend Foundation to ${name}`);
      }
    }
  }
}

const rootPackage = parseJson(join(root, 'package.json'));
if (rootPackage) {
  for (const { file, manifest } of manifests) {
    if (manifest.name?.startsWith('@foundation/') && manifest.version !== rootPackage.version) {
      errors.push(`${relative(root, file)} version ${manifest.version} must match root version ${rootPackage.version}`);
    }
  }
  if (!String(rootPackage.packageManager ?? '').startsWith('pnpm@11.')) errors.push('Root packageManager must pin pnpm 11.x');
  if (!rootPackage.scripts?.['lint:architecture']) errors.push('Missing lint:architecture script');
  if (!rootPackage.scripts?.['verify:offline']) errors.push('Missing verify:offline script');
  for (const script of ['release:preflight', 'release:plan', 'release:pack', 'release:publish', 'project:doctor', 'project:upgrade', 'project:compile', 'project:status', 'oss:verify', 'deploy:verify']) {
    if (!rootPackage.scripts?.[script]) errors.push(`Missing ${script} script`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Repository checks passed (${manifests.length} workspace manifests, ${sourceFiles.length} TS/TSX files)`);
