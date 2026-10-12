import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../create-app/index.mjs';
import { generateModule } from '../create-app/generate.mjs';
import { runPnpm } from './pnpm-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const versions = JSON.parse(await readFile(join(root, 'tooling/create-app/versions.json'), 'utf8'));

runPnpm(['build:packages'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(root, 'tooling/scripts/pack-foundation.mjs')], { cwd: root, stdio: 'inherit' });

// Keep consumer smoke projects outside the pnpm workspace: installs must exercise
// independent projects consuming packed artifacts, not the root workspace.
const baseWork = await mkdtemp(join(tmpdir(), 'foundation-consumer-'));
console.log(`Independent consumer test root: ${baseWork}`);

const artifacts = resolve(root, 'artifacts/packages');
const artifactManifest = JSON.parse(await readFile(join(artifacts, 'manifest.json'), 'utf8'));


const offlineNodeModules = process.env.FOUNDATION_CONSUMER_OFFLINE_NODE_MODULES
  ? resolve(process.env.FOUNDATION_CONSUMER_OFFLINE_NODE_MODULES)
  : undefined;

function packagePath(rootDir, packageName) {
  return join(rootDir, ...packageName.split('/'));
}

async function exposeBins(nodeModules, dependencyDir) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(dependencyDir, 'package.json'), 'utf8')); }
  catch { return; }
  let bins = manifest.bin;
  if (typeof bins === 'string') bins = { [manifest.name?.split('/').at(-1) ?? 'bin']: bins };
  if (!bins || typeof bins !== 'object') return;
  const binDir = join(nodeModules, '.bin');
  await mkdir(binDir, { recursive: true });
  for (const [name, relativeBin] of Object.entries(bins)) {
    const link = join(binDir, name);
    await rm(link, { force: true });
    await symlink(resolve(dependencyDir, relativeBin), link);
  }
}

async function extractFoundationTarballs(work, manifest) {
  const nodeModules = join(work, 'node_modules');
  await mkdir(nodeModules, { recursive: true });
  const releaseArtifacts = { ...(manifest.packages ?? {}), ...(manifest.tools ?? {}) };
  for (const [packageName, tarball] of Object.entries(releaseArtifacts)) {
    const target = packagePath(nodeModules, packageName);
    await rm(target, { recursive: true, force: true });
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.extract`;
    await rm(temp, { recursive: true, force: true });
    await mkdir(temp, { recursive: true });
    execFileSync('tar', ['-xzf', join(artifacts, tarball), '-C', temp], { stdio: 'inherit' });
    await symlink(join(temp, 'package'), target);
  }
}

async function linkOfflineThirdParty(work, profile, snapshotNodeModules) {
  const map = JSON.parse(await readFile(join(snapshotNodeModules, '.package-map.json'), 'utf8')).packages;
  const packageManifest = JSON.parse(await readFile(join(work, 'package.json'), 'utf8'));
  const requested = {
    ...(packageManifest.dependencies ?? {}),
    ...(packageManifest.devDependencies ?? {})
  };
  const preferredSources = ['apps/showcase', 'apps/starter', 'apps/storybook', '.'];
  const workspaceSources = [
    ...preferredSources,
    ...Object.keys(map).filter((key) => !preferredSources.includes(key) && !key.includes('@') && map[key]?.dependencies)
  ];
  const nodeModules = join(work, 'node_modules');
  await mkdir(nodeModules, { recursive: true });

  for (const name of Object.keys(requested)) {
    if (name.startsWith('@foundation/')) continue;
    let dependencyId;
    for (const sourceKey of workspaceSources) {
      const candidate = map[sourceKey]?.dependencies?.[name];
      if (candidate && !candidate.startsWith('packages/') && !candidate.startsWith('apps/')) {
        dependencyId = candidate;
        break;
      }
    }
    if (!dependencyId) throw new Error(`Offline dependency snapshot cannot resolve ${name} for ${profile}`);
    const info = map[dependencyId];
    if (!info?.url) throw new Error(`Offline dependency snapshot cannot resolve ${name} (${dependencyId})`);
    const target = resolve(snapshotNodeModules, info.url);
    const link = packagePath(nodeModules, name);
    await rm(link, { recursive: true, force: true });
    await mkdir(dirname(link), { recursive: true });
    await symlink(target, link);
    await exposeBins(nodeModules, target);
  }
}

async function prepareOfflineConsumer(work, profile, manifest) {
  if (!offlineNodeModules) return false;
  await extractFoundationTarballs(work, manifest);
  await linkOfflineThirdParty(work, profile, offlineNodeModules);
  return true;
}

async function normalizeFoundationRangesForDoctor(work, version) {
  const packageFile = join(work, 'package.json');
  const manifest = JSON.parse(await readFile(packageFile, 'utf8'));
  for (const sectionName of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const section = manifest[sectionName];
    if (!section || typeof section !== 'object') continue;
    for (const packageName of Object.keys(section)) {
      if (packageName.startsWith('@foundation/')) section[packageName] = `^${version}`;
    }
  }
  await writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

const smokeByProfile = {
  minimal: `import { Page, PageContent, PageHeader } from '@foundation/ui';
export function Component() {
  return <Page><PageHeader title="Minimal Consumer" /><PageContent>consumer-ok</PageContent></Page>;
}
`,
  management: `import { Button } from 'antd';
import { DataTable } from '@foundation/data';
import { FormActions } from '@foundation/forms';
import { PermissionGate } from '@foundation/security';
import { Page, PageContent, PageHeader } from '@foundation/ui';
export function Component() {
  return <Page><PageHeader title="Management Consumer" /><PageContent>
    <PermissionGate permission="x.read"><Button>Allowed</Button></PermissionGate>
    <DataTable rowKey="id" columns={[{ title: 'ID', dataIndex: 'id' }]} data={[{ id: '1' }]} pagination={false} />
    <form><FormActions submitText="Save" /></form>
  </PageContent></Page>;
}
`,
  'data-workbench': `import { AsyncOperationPanel } from '@foundation/async';
import { FileTransferList } from '@foundation/file';
import { Page, PageContent, PageHeader } from '@foundation/ui';
import { TimeSeriesChart } from '@foundation/visualization';
export function Component() {
  return <Page><PageHeader title="Data Workbench Consumer" /><PageContent>
    <FileTransferList items={[]} />
    <AsyncOperationPanel operation={{ id: 'consumer-op', status: 'succeeded', progress: 100 }} />
    <TimeSeriesChart height={180} series={[{ name: 'Series', data: [[0, 1], [1000, 2]] }]} />
  </PageContent></Page>;
}
`
};

for (const profile of ['minimal', 'management', 'data-workbench']) {
  const work = join(baseWork, profile);
  createApp([
    work,
    '--name', `foundation-consumer-${profile}`,
    '--app-id', `consumer.${profile.replaceAll('-', '.')}`,
    '--title', `Foundation Consumer ${profile}`,
    '--profile', profile
  ]);
  generateModule([
    'module', `generated-${profile}`,
    '--project', work,
    '--pattern', profile === 'minimal' ? 'page' : profile,
    '--title', `Generated ${profile}`
  ]);

  if (profile === 'management') {
    const resourceSpec = join(work, 'consumer-records.resource.json');
    await writeFile(resourceSpec, `${JSON.stringify({
      schemaVersion: 1,
      id: 'consumer-records',
      title: 'Consumer Records',
      route: 'consumer-records',
      idField: 'id',
      api: {
        list: { method: 'GET', path: 'consumer-records' },
        detail: { method: 'GET', path: 'consumer-records/{id}' },
        update: { method: 'PUT', path: 'consumer-records/{id}' }
      },
      fields: [
        { name: 'id', label: 'ID', type: 'string', list: true, detail: true, editable: false },
        { name: 'title', label: 'Title', type: 'string', required: true, list: true, detail: true, editable: true, searchable: true },
        { name: 'status', label: 'Status', type: 'enum', values: ['draft', 'ready'], required: true, list: true, detail: true, editable: true, filterable: true }
      ]
    }, null, 2)}
`, 'utf8');
    generateModule(['resource', resourceSpec, '--project', work]);
  }

  const packageFile = join(work, 'package.json');
  const consumerPackage = JSON.parse(await readFile(packageFile, 'utf8'));

  // Make every internal Foundation edge resolve to the exact tarball bytes under test.
  // The generated profile dependency set is validated separately by create-app/doctor tests.
  const releaseArtifacts = { ...(artifactManifest.packages ?? {}), ...(artifactManifest.tools ?? {}) };
  const consumerWorkspace = { packages: ['.'], overrides: {} };
  for (const [packageName, tarball] of Object.entries(releaseArtifacts)) {
    const targetSection = consumerPackage.devDependencies?.[packageName] !== undefined ? consumerPackage.devDependencies : consumerPackage.dependencies;
    const tarballReference = `file:${join(artifacts, tarball)}`;
    targetSection[packageName] = tarballReference;
    // Packed packages refer to each other by release versions. Force those
    // transitive edges to the same local tarballs instead of the public registry.
    consumerWorkspace.overrides[packageName] = tarballReference;
  }
  // Packed packages declare these as peers; keep them available when all tarballs are injected.
  consumerPackage.dependencies['react-hook-form'] ??= versions['react-hook-form'];
  consumerPackage.dependencies.echarts ??= versions.echarts;
  await writeFile(packageFile, `${JSON.stringify(consumerPackage, null, 2)}\n`, 'utf8');
  // pnpm 11 reads overrides from pnpm-workspace.yaml. JSON is valid YAML and
  // keeps this generated single-project workspace deterministic.
  await writeFile(join(work, 'pnpm-workspace.yaml'), `${JSON.stringify(consumerWorkspace, null, 2)}\n`, 'utf8');

  await writeFile(join(work, 'src/modules/home/pages/home.route.tsx'), smokeByProfile[profile], 'utf8');

  const offlinePrepared = await prepareOfflineConsumer(work, profile, artifactManifest);
  if (!offlinePrepared) runPnpm(['install'], { cwd: work, stdio: 'inherit' });
  else console.log(`Consumer profile ${profile} is using offline dependency snapshot ${offlineNodeModules}`);
  runPnpm(['build'], { cwd: work, stdio: 'inherit' });
  // Installation and build already exercised the exact tarballs. Restore
  // comparable release ranges before the strict compatibility diagnosis.
  await normalizeFoundationRangesForDoctor(work, artifactManifest.version);
  execFileSync(process.execPath, [resolve(root, 'tooling/create-app/doctor.mjs'), work, '--target', artifactManifest.version, '--strict'], { cwd: root, stdio: 'inherit' });
  console.log(`Consumer profile ${profile} passed`);
}

console.log('Consumer test passed for all profiles');
