import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

test('shadow PoCs stay outside production workspace', () => {
  const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  assert.equal(workspace.includes('experiments/'), false);
});

test('Refine trial is core-only', () => {
  const pkg = readJson('experiments/oss-convergence/refine-core-poc/package.json');
  assert.equal(pkg.dependencies['@refinedev/core'], '5.1.0');
  assert.equal(pkg.dependencies['@refinedev/antd'], undefined);
  assert.equal(pkg.dependencies['@refinedev/react-router'], undefined);
});

test('ProComponents trial is isolated from Refine', () => {
  const pkg = readJson('experiments/oss-convergence/pro-components-poc/package.json');
  assert.ok(pkg.dependencies['@ant-design/pro-components']);
  assert.equal(pkg.dependencies['@refinedev/core'], undefined);
});

test('OSS verifier passes', () => {
  execFileSync(process.execPath, [join(root, 'tooling/oss/verify.mjs')], { cwd: root, stdio: 'pipe' });
});

const { evaluate } = await import('../scorecard.mjs');

test('scorecard promotes candidates only after measurable replacement value', () => {
  const passing = evaluate({
    proComponents: {
      compiled: true, testsPassed: true, kernelContractChanges: 0,
      ownedLocBefore: 453, ownedLocAfter: 300, foundationPublicExportDelta: -2,
      bundleGzipDeltaKiB: 80, antdDowngrade: false, routerDowngrade: false,
      apiContractPreserved: true
    },
    refineCore: {
      compiled: true, testsPassed: true, kernelContractChanges: 0,
      bridgeLoc: 120, projectGlueLocBefore: 300, projectGlueLocAfter: 220,
      usesRefineAntd: false, usesRefineRouter: false,
      antdDowngrade: false, routerDowngrade: false, apiContractPreserved: true
    }
  });
  assert.equal(passing.proComponents.pass, true);
  assert.equal(passing.refineCore.pass, true);

  const failing = evaluate({
    proComponents: { compiled: true, testsPassed: true, kernelContractChanges: 0, ownedLocBefore: 453, ownedLocAfter: 440, foundationPublicExportDelta: 3, bundleGzipDeltaKiB: 250, antdDowngrade: false, routerDowngrade: false, apiContractPreserved: true },
    refineCore: { compiled: true, testsPassed: true, kernelContractChanges: 0, bridgeLoc: 300, projectGlueLocBefore: 300, projectGlueLocAfter: 290, usesRefineAntd: false, usesRefineRouter: false, antdDowngrade: false, routerDowngrade: false, apiContractPreserved: true }
  });
  assert.equal(failing.proComponents.pass, false);
  assert.equal(failing.refineCore.pass, false);
});
