import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { planUpgrade, upgradeProject } from '../upgrade.mjs';
import { createApp } from '../index.mjs';

const currentVersion = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')).version;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'foundation-upgrade-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'fixture',
    private: true,
    dependencies: {
      '@foundation/app': '^0.4.0',
      '@foundation/ui': '^0.4.1',
      react: '^19.3.0'
    },
    devDependencies: { '@foundation/testing': '^0.4.0' }
  }, null, 2));
  mkdirSync(join(root, 'src/modules'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'src/modules/index.ts'), 'export const modules = [];\n');
  writeFileSync(join(root, 'public/runtime-config.json'), '{}');
  writeFileSync(join(root, 'foundation.config.json'), JSON.stringify({
    schemaVersion: 1,
    foundationVersion: '0.4.0',
    profile: { name: 'minimal', source: 'builtin', capabilities: ['application-shell', 'ui-patterns'], foundationPackages: ['app', 'ui'], dependencies: [] },
    deployment: 'none',
    modules: { directory: 'src/modules', routeFile: 'routes.ts', exportName: 'module' }
  }, null, 2));
  return root;
}

test('upgrade defaults to a non-mutating plan', () => {
  const root = fixture();
  try {
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    const configBefore = readFileSync(join(root, 'foundation.config.json'), 'utf8');
    const result = planUpgrade(root, { target: '0.5.0' });
    assert.equal(result.changes.length, 3);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
    assert.equal(readFileSync(join(root, 'foundation.config.json'), 'utf8'), configBefore);
    assert.equal(result.foundationConfigChanged, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('upgrade --write aligns all Foundation dependency sections', () => {
  const root = fixture();
  try {
    const result = upgradeProject(root, { target: '0.5.0', write: true });
    assert.equal(result.written, true);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies['@foundation/app'], '^0.5.0');
    assert.equal(pkg.dependencies['@foundation/ui'], '^0.5.0');
    assert.equal(pkg.devDependencies['@foundation/testing'], '^0.5.0');
    assert.equal(pkg.dependencies.react, '^19.3.0');
    const config = JSON.parse(readFileSync(join(root, 'foundation.config.json'), 'utf8'));
    assert.equal(config.foundationVersion, '0.5.0');
    assert.deepEqual(result.doctor?.issues, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('upgrade rejects invalid targets', () => {
  const root = fixture();
  try { assert.throws(() => planUpgrade(root, { target: 'latest' }), /Invalid target version/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});


test('upgrade accepts an already-aligned app dependency and updates remaining metadata', () => {
  const root = fixture();
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkg.dependencies['@foundation/app'] = '^0.5.0';
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    const result = planUpgrade(root, { target: '0.5.0' });
    assert.ok(result.changes.every((change) => change.name !== '@foundation/app'));
    assert.equal(result.foundationConfigChanged, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('upgrade to the current Foundation line also realigns the pinned contract adapter', () => {
  const root = mkdtempSync(join(tmpdir(), 'foundation-upgrade-contract-'));
  try {
    const target = join(root, 'app');
    createApp([target, '--contract', 'openapi', '--foundation-version', '0.9.0']);
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    pkg.devDependencies['@hey-api/openapi-ts'] = '0.98.0';
    writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2));
    const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
    config.contracts[0].adapterVersion = '0.98.0';
    writeFileSync(join(target, 'foundation.config.json'), JSON.stringify(config, null, 2));

    const result = upgradeProject(target, { target: currentVersion, write: true });
    const updatedPackage = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    const updatedConfig = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
    assert.equal(updatedPackage.devDependencies['@hey-api/openapi-ts'], '0.99.0');
    assert.equal(updatedConfig.contracts[0].adapterVersion, '0.99.0');
    assert.equal(updatedConfig.foundationVersion, currentVersion);
    assert.deepEqual(result.doctor?.issues, []);
    assert.ok(result.doctor?.warnings.some((warning) => warning.includes('has not been generated')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('upgrade from the 0.21 RC line to Stable removes prerelease ranges without rewriting application source', () => {
  const root = fixture();
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkg.dependencies['@foundation/app'] = '^0.21.0-rc.1';
    pkg.dependencies['@foundation/ui'] = '^0.21.0-rc.1';
    pkg.devDependencies['@foundation/testing'] = '^0.21.0-rc.1';
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    const config = JSON.parse(readFileSync(join(root, 'foundation.config.json'), 'utf8'));
    config.foundationVersion = '0.21.0-rc.1';
    writeFileSync(join(root, 'foundation.config.json'), JSON.stringify(config, null, 2));
    const sourceBefore = readFileSync(join(root, 'src/modules/index.ts'), 'utf8');

    const result = upgradeProject(root, { target: currentVersion, write: true });
    const updatedPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const updatedConfig = JSON.parse(readFileSync(join(root, 'foundation.config.json'), 'utf8'));
    assert.equal(currentVersion, '0.21.0');
    assert.equal(updatedPackage.dependencies['@foundation/app'], '^0.21.0');
    assert.equal(updatedPackage.dependencies['@foundation/ui'], '^0.21.0');
    assert.equal(updatedPackage.devDependencies['@foundation/testing'], '^0.21.0');
    assert.equal(updatedConfig.foundationVersion, '0.21.0');
    assert.equal(readFileSync(join(root, 'src/modules/index.ts'), 'utf8'), sourceBefore);
    assert.deepEqual(result.doctor?.issues, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

