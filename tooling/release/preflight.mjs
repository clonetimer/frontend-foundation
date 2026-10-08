#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../create-app/index.mjs';
import { generateModule } from '../create-app/generate.mjs';
import { inspectProject } from '../create-app/doctor.mjs';
import { foundationLibraryManifests, publishableManifests, readJson, root, semverPattern, topologicalPublishOrder, workspaceManifests } from './lib.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { verifyPublicApiSnapshot } from './public-api.mjs';
import { tmpdir } from 'node:os';

export function runPreflight() {
  const errors = [];
  const rootPackage = readJson(join(root, 'package.json'));
  const version = rootPackage.version;
  if (!semverPattern.test(version ?? '')) errors.push(`Invalid root version: ${version}`);
  if (!existsSync(join(root, 'pnpm-lock.yaml'))) errors.push('Missing pnpm-lock.yaml; Stable candidates must freeze the dependency graph');
  for (const error of verifyPublicApiSnapshot().errors) errors.push(`public-api: ${error}`);

  const all = workspaceManifests();
  const publishable = publishableManifests();
  const byName = new Map(all.map((item) => [item.manifest.name, item]));
  const libraries = foundationLibraryManifests();
  const names = new Set(all.map(({ manifest }) => manifest.name));

  const lockfileText = existsSync(join(root, 'pnpm-lock.yaml')) ? readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8') : '';
  for (const appName of ['@foundation/pilot-management', '@foundation/pilot-data', '@foundation/designer']) {
    const item = byName.get(appName);
    if (!item || !item.manifest.private) errors.push(`Missing private regression app ${appName}`);
    else if (!item.manifest.scripts?.build || !item.manifest.scripts?.typecheck) errors.push(`${appName} must expose build and typecheck scripts`);
    const appDir = appName === '@foundation/designer' ? 'designer' : appName.replace('@foundation/pilot-', 'pilot-');
    const importer = `apps/${appDir}:`;
    if (lockfileText && !lockfileText.includes(importer)) errors.push(`pnpm-lock.yaml missing importer ${importer.slice(0, -1)}`);
  }

  const domainFixture = byName.get('@example/domain-widgets');
  if (!domainFixture) errors.push('Missing retained Domain Component SDK fixture @example/domain-widgets');
  else {
    if (!domainFixture.manifest.private) errors.push('@example/domain-widgets retained SDK fixture must remain private');
    for (const script of ['build', 'typecheck', 'domain:verify']) if (!domainFixture.manifest.scripts?.[script]) errors.push(`@example/domain-widgets must expose ${script}`);
    if (!existsSync(join(domainFixture.dir, 'foundation.registry.json'))) errors.push('@example/domain-widgets is missing foundation.registry.json');
    if (!lockfileText.includes('packages/domain-widgets-fixture:')) errors.push('pnpm-lock.yaml missing importer packages/domain-widgets-fixture');
    const storybook = byName.get('@foundation/storybook');
    if (storybook?.manifest.dependencies?.['@example/domain-widgets'] !== 'workspace:*') errors.push('@foundation/storybook must exercise @example/domain-widgets through a workspace dependency');
  }

  for (const { file, manifest } of all) {
    if (manifest.name?.startsWith('@foundation/') && manifest.version !== version) {
      errors.push(`${relative(root, file)} version ${manifest.version} != ${version}`);
    }
  }

  for (const { group, manifest, dir } of publishable) {
    if (!manifest.name?.startsWith('@foundation/')) errors.push(`Publishable package outside scope: ${manifest.name}`);
    if (manifest.engines?.node !== '^22.13.0 || ^24.0.0') errors.push(`${manifest.name} must declare the supported Node engine line`);
    if (!existsSync(join(dir, 'README.md'))) errors.push(`${manifest.name} is missing README.md`);
    if (group === 'packages') {
      if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) errors.push(`${manifest.name} must publish dist`);
      if (!manifest.exports?.['.']) errors.push(`${manifest.name} missing exports["."]`);
      if (!existsSync(join(dir, 'src', 'index.ts'))) errors.push(`${manifest.name} missing src/index.ts`);
    }
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const [dep, range] of Object.entries(manifest[field] ?? {})) {
        if (dep.startsWith('@foundation/') && !names.has(dep)) errors.push(`${manifest.name} depends on unknown ${dep}`);
        if (dep.startsWith('@foundation/') && range !== 'workspace:*') errors.push(`${manifest.name} internal ${field}.${dep} must be workspace:* before publish`);
      }
    }
  }

  const createAppPackage = publishable.find(({ manifest }) => manifest.name === '@foundation/create-app');
  if (!createAppPackage) errors.push('@foundation/create-app must be publishable');
  else {
    const { manifest, dir } = createAppPackage;
    if (manifest.private) errors.push('@foundation/create-app must not be private');
    if (manifest.bin?.['create-foundation-app'] !== './index.mjs') errors.push('create-app bin create-foundation-app is missing');
    if (manifest.bin?.['foundation-doctor'] !== './doctor.mjs') errors.push('create-app bin foundation-doctor is missing');
    if (manifest.bin?.['foundation-upgrade'] !== './upgrade.mjs') errors.push('create-app bin foundation-upgrade is missing');
    if (manifest.bin?.['foundation-generate'] !== './generate.mjs') errors.push('create-app bin foundation-generate is missing');
    if (manifest.bin?.['foundation-contract'] !== './contract.mjs') errors.push('create-app bin foundation-contract is missing');
    if (manifest.bin?.['foundation-domain'] !== './domain-component.mjs') errors.push('create-app bin foundation-domain is missing');
    for (const required of ['index.mjs', 'doctor.mjs', 'upgrade.mjs', 'generate.mjs', 'contract.mjs', 'domain-component.mjs', 'versions.json', 'profiles.json', 'composition.json', 'patterns.json', 'patterns', 'contracts.json', 'contracts', 'contract-fixtures', 'deployments.json', 'template', 'deployments']) {
      if (!manifest.files?.includes(required)) errors.push(`create-app files must include ${required}`);
    }
    if (!existsSync(join(dir, 'template', 'package.json.tmpl'))) errors.push('create-app template is incomplete');
  }

  const contractCatalog = readJson(join(root, 'tooling', 'create-app', 'contracts.json'));
  for (const [adapterId, adapter] of Object.entries(contractCatalog.adapters ?? {})) {
    if (!adapter.admission) errors.push(`contract adapter ${adapterId} is missing an admission policy`);
    if (adapter.stability === 'stable' && adapter.admission?.status !== 'passed') {
      errors.push(`contract adapter ${adapterId} cannot be stable while admission status is ${String(adapter.admission?.status)}`);
    }
    for (const fixture of adapter.admission?.fixtures ?? []) {
      if (!existsSync(join(root, 'tooling', 'create-app', fixture.file))) errors.push(`contract adapter ${adapterId} admission fixture missing: ${fixture.file}`);
    }
  }

  const releaseNote = join(root, 'docs', 'releases', `${version}.md`);
  if (!existsSync(releaseNote)) errors.push(`Missing release note docs/releases/${version}.md`);
  else {
    const releaseNoteText = readFileSync(releaseNote, 'utf8');
    if (/\bTODO\s*:|:\s*TODO\b/.test(releaseNoteText)) errors.push(`Release note docs/releases/${version}.md still contains TODO placeholders`);
  }

  try { topologicalPublishOrder(publishable); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }

  const temp = mkdtempSync(join(tmpdir(), 'foundation-preflight-'));
  try {
    for (const profile of ['minimal', 'management', 'data-workbench']) {
      const target = join(temp, profile);
      createApp([target, '--name', `preflight-${profile}`, '--app-id', `preflight.${profile.replaceAll('-', '.')}`, '--title', `Preflight ${profile}`, '--profile', profile]);
      const generated = JSON.stringify(readJson(join(target, 'package.json')));
      if (generated.includes('workspace:*') || generated.includes('catalog:')) errors.push(`create-app ${profile} leaked workspace/catalog protocol`);
      if (!generated.includes(`^${version}`)) errors.push(`create-app ${profile} did not target ^${version}`);
      const pattern = profile === 'minimal' ? 'page' : profile;
      generateModule(['module', `preflight-${profile}-module`, '--project', target, '--pattern', pattern, '--title', `Preflight ${profile} module`]);
      const doctor = inspectProject(target, { target: version });
      for (const issue of doctor.issues) errors.push(`generated-app ${profile} doctor: ${issue}`);
      for (const warning of doctor.warnings) errors.push(`generated-app ${profile} doctor warning: ${warning}`);
    }
    const nginxTarget = join(temp, 'nginx');
    createApp([nginxTarget, '--name', 'preflight-nginx', '--app-id', 'preflight.nginx', '--title', 'Preflight Nginx', '--deployment', 'nginx']);
    const nginxDoctor = inspectProject(nginxTarget, { target: version });
    for (const issue of nginxDoctor.issues) errors.push(`generated-app nginx doctor: ${issue}`);
    for (const warning of nginxDoctor.warnings) errors.push(`generated-app nginx doctor warning: ${warning}`);
    const nginxConf = readFileSync(join(nginxTarget, 'deploy/nginx/default.static.conf'), 'utf8');
    if (!nginxConf.includes('try_files $uri $uri/ /index.html')) errors.push('generated nginx deployment missing SPA fallback');
    if (!nginxConf.includes('location = /runtime-config.json')) errors.push('generated nginx deployment missing runtime-config cache boundary');

    const contractTarget = join(temp, 'openapi-contract');
    createApp([contractTarget, '--name', 'preflight-contract', '--app-id', 'preflight.contract', '--title', 'Preflight Contract', '--contract', 'openapi']);
    const contractPackage = readJson(join(contractTarget, 'package.json'));
    const contractConfig = readJson(join(contractTarget, 'foundation.config.json'));
    const contractSpec = readJson(join(contractTarget, 'contracts', 'openapi.json'));
    if (contractPackage.devDependencies?.['@hey-api/openapi-ts'] !== '0.99.0') errors.push('generated OpenAPI contract project must pin @hey-api/openapi-ts@0.99.0 exactly');
    if (contractPackage.foundation?.contract !== 'openapi') errors.push('generated OpenAPI contract project missing package foundation.contract metadata');
    if (contractConfig.contractMode !== 'openapi' || contractConfig.contracts?.[0]?.adapter !== 'hey-api-typescript') errors.push('generated OpenAPI contract manifest is incomplete');
    if (!contractConfig.contracts?.[0]?.inputFormats?.includes('json')) errors.push('generated OpenAPI contract manifest must preserve the Candidate JSON-only input gate');
    if (!existsSync(join(contractTarget, 'src', 'contracts', 'runtime.ts'))) errors.push('generated OpenAPI contract project is missing src/contracts/runtime.ts');
    if (contractSpec.openapi !== '3.1.0') errors.push('generated OpenAPI starter contract must be OpenAPI 3.1.0');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }

  // Guard against accidentally publishing npm auth or a concrete registry in repository files.
  for (const file of ['.npmrc', 'package.json']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (/(_authToken|npm_[A-Za-z0-9]{20,})/i.test(text)) errors.push(`${file} must not contain registry credentials`);
  }

  return { version, errors, publishable: publishable.map(({ manifest }) => manifest.name), libraries: libraries.map(({ manifest }) => manifest.name) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = runPreflight();
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Release preflight passed for ${result.version} (${result.publishable.length} publishable packages)`);
  }
}
