import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../index.mjs';
import { auditContractAdapter, generateContracts, inspectContractState, runContractCommand, verifyContracts, versionMatchesSimpleRange } from '../contract.mjs';

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-contract-test-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function installFakeHeyApi(projectRoot, version = '0.99.0', options = {}) {
  const dir = join(projectRoot, 'node_modules', '@hey-api', 'openapi-ts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@hey-api/openapi-ts',
    version,
    license: 'MIT',
    type: 'module',
    exports: './index.mjs',
    dependencies: { '@hey-api/json-schema-ref-parser': '1.4.4' }
  }, null, 2));
  const parserDir = join(dir, 'node_modules', '@hey-api', 'json-schema-ref-parser');
  mkdirSync(parserDir, { recursive: true });
  writeFileSync(join(parserDir, 'package.json'), JSON.stringify({
    name: '@hey-api/json-schema-ref-parser',
    version: '1.4.4',
    license: 'MIT',
    dependencies: { 'js-yaml': options.jsYamlVersion ?? '4.3.0' }
  }, null, 2));
  const yamlDir = join(parserDir, 'node_modules', 'js-yaml');
  mkdirSync(yamlDir, { recursive: true });
  writeFileSync(join(yamlDir, 'package.json'), JSON.stringify({
    name: 'js-yaml',
    version: options.jsYamlVersion ?? '4.3.0',
    license: 'MIT'
  }, null, 2));
  const admissionLines = options.omitAdmissionField
    ? ["export type DetailNested = { editable: boolean };", "export type ItemRead = { detail?: DetailNested };"]
    : ["export type Audit = { approvable: boolean };", "export type DetailNested = { editable: boolean };", "export type ItemRead = { detail?: DetailNested } & Audit;"];
  writeFileSync(join(dir, 'index.mjs'), `
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export async function createClient(config) {
  const spec = JSON.parse(readFileSync(config.input, 'utf8'));
  const output = typeof config.output === 'string' ? config.output : config.output.path;
  mkdirSync(output, { recursive: true });
  const admission = spec.info?.title === 'Foundation Admission Fixture';
  writeFileSync(join(output, 'types.gen.ts'), admission ? ${JSON.stringify(admissionLines.join('\n')+'\n')} : [
    '// fake deterministic upstream used by Foundation contract tests',
    'export type ApiTitle = ' + JSON.stringify(spec.info.title) + ';',
    'export type Status = { ok: boolean };',
    ''
  ].join('\\n'));
}
`, 'utf8');
}

test('lists contract modes and keeps them orthogonal to profiles/deployments', () => {
  const result = runContractCommand(['--list-adapters']);
  assert.equal(result.listAdapters, true);
  assert.equal(result.adapters[0].id, 'hey-api-typescript');
  assert.equal(result.adapters[0].version, '0.99.0');
  assert.equal(result.adapters[0].stability, 'candidate');
  assert.deepEqual(result.adapters[0].supportedOpenApi, ['3.1']);
  assert.deepEqual(result.adapters[0].inputFormats, ['json']);
  assert.equal(result.adapters[0].securityGate, 'candidate-json-only');
});

test('create-app openapi contract mode pins the adapter and writes a reproducible local spec', () => withTemp((root) => {
  const target = join(root, 'app');
  const result = createApp([target, '--profile', 'management', '--deployment', 'nginx', '--contract', 'openapi']);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
  const spec = JSON.parse(readFileSync(join(target, 'contracts', 'openapi.json'), 'utf8'));
  assert.equal(result.contract, 'openapi');
  assert.equal(pkg.foundation.contract, 'openapi');
  assert.equal(pkg.devDependencies['@hey-api/openapi-ts'], '0.99.0');
  assert.equal(pkg.scripts['foundation:contract'], 'foundation-contract generate');
  assert.equal(config.contractMode, 'openapi');
  assert.equal(config.contracts[0].adapter, 'hey-api-typescript');
  assert.equal(config.contracts[0].adapterVersion, '0.99.0');
  assert.equal(config.contracts[0].adapterStability, 'candidate');
  assert.deepEqual(config.contracts[0].supportedOpenApi, ['3.1']);
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(readFileSync(join(target, 'src', 'contracts', 'README.md'), 'utf8').includes('@foundation/api'));
  const runtime = readFileSync(join(target, 'src', 'contracts', 'runtime.ts'), 'utf8');
  assert.match(runtime, /ApiTransport/);
  assert.match(runtime, /requestContractJson/);
  assert.doesNotMatch(runtime, /@hey-api\//);
}));

test('contract generation, lock, deterministic verification and drift detection work through the adapter boundary', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  installFakeHeyApi(target);

  const before = inspectContractState(target);
  assert.equal(before.issues.length, 0);
  assert.ok(before.warnings.some((warning) => warning.includes('has not been generated')));

  const generated = generateContracts(target);
  assert.equal(generated.generated.length, 1);
  assert.deepEqual(generated.generated[0].files, ['types.gen.ts']);
  const lock = JSON.parse(readFileSync(join(target, 'foundation.contract.lock.json'), 'utf8'));
  assert.equal(lock.contracts.api.adapterVersion, '0.99.0');
  assert.match(lock.contracts.api.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.contracts.api.outputSha256, /^[a-f0-9]{64}$/);

  const after = inspectContractState(target);
  assert.deepEqual(after.issues, []);
  assert.deepEqual(after.warnings, []);
  const verified = verifyContracts(target);
  assert.equal(verified.verified[0].name, 'api');

  writeFileSync(join(target, 'src', 'contracts', 'generated', 'types.gen.ts'), '// drift\n');
  const drift = inspectContractState(target);
  assert.ok(drift.issues.some((issue) => issue.includes('output drift')));
  assert.throws(() => verifyContracts(target), /output drift/);
}));

test('contract tooling rejects adapter/version drift and unsupported specs before invoking upstream', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  installFakeHeyApi(target, '0.98.0');
  assert.throws(() => generateContracts(target), /differs from pinned 0\.99\.0/);

  installFakeHeyApi(target, '0.99.0');
  const specFile = join(target, 'contracts', 'openapi.json');
  const spec = JSON.parse(readFileSync(specFile, 'utf8'));
  spec.openapi = '3.0.3';
  writeFileSync(specFile, JSON.stringify(spec, null, 2));
  assert.throws(() => generateContracts(target), /blocked by Foundation/);

  spec.openapi = '4.0.0';
  writeFileSync(specFile, JSON.stringify(spec, null, 2));
  assert.throws(() => generateContracts(target), /outside enabled adapter support/);
}));

test('contract mode none remains zero-cost and verify succeeds without upstream packages', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target]);
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(target, 'foundation.config.json'), 'utf8'));
  assert.equal(pkg.foundation.contract, 'none');
  assert.equal(pkg.devDependencies['@hey-api/openapi-ts'], undefined);
  assert.deepEqual(config.contracts, []);
  assert.deepEqual(generateContracts(target).generated, []);
  assert.deepEqual(verifyContracts(target).verified, []);
}));


test('contract mode requires its project-side runtime integration files', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  unlinkSync(join(target, 'src', 'contracts', 'runtime.ts'));
  const state = inspectContractState(target);
  assert.ok(state.issues.some((issue) => issue.includes('requires src/contracts/runtime.ts')));
}));


test('candidate contract adapter rejects YAML input until the upstream security gate passes', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  const configFile = join(target, 'foundation.config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.contracts[0].source = 'contracts/openapi.yaml';
  writeFileSync(configFile, JSON.stringify(config, null, 2));
  writeFileSync(join(target, 'contracts', 'openapi.yaml'), 'openapi: 3.1.0\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}\n');
  installFakeHeyApi(target);
  assert.throws(() => generateContracts(target), /only enables input formats: json/);
}));


test('simple admission semver ranges cover the pinned security rules', () => {
  assert.equal(versionMatchesSimpleRange('4.2.0', '>=4.0.0 <4.3.0'), true);
  assert.equal(versionMatchesSimpleRange('4.3.0', '>=4.0.0 <4.3.0'), false);
  assert.equal(versionMatchesSimpleRange('5.2.0', '>=5.0.0 <=5.2.0'), true);
  assert.equal(versionMatchesSimpleRange('5.2.1', '>=5.0.0 <=5.2.0'), false);
});

test('adapter admission passes only when the installed dependency graph and fixture output are acceptable', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  installFakeHeyApi(target, '0.99.0', { jsYamlVersion: '4.3.0' });
  const audit = auditContractAdapter(target, 'hey-api-typescript');
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.issues, []);
  assert.equal(audit.fixtures.length, 1);
  assert.match(audit.fixtures[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(audit.dependencies.some((item) => item.name === 'js-yaml' && item.version === '4.3.0'));
}));

test('adapter admission rejects a Foundation-blocked transitive dependency version', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  installFakeHeyApi(target, '0.99.0', { jsYamlVersion: '4.2.0' });
  const audit = auditContractAdapter(target, 'hey-api-typescript');
  assert.equal(audit.passed, false);
  assert.ok(audit.issues.some((issue) => issue.includes('GHSA-52cp-r559-cp3m')));
}));

test('adapter admission rejects deterministic output that silently loses required fixture semantics', () => withTemp((root) => {
  const target = join(root, 'app');
  createApp([target, '--contract', 'openapi']);
  installFakeHeyApi(target, '0.99.0', { jsYamlVersion: '4.3.0', omitAdmissionField: true });
  const audit = auditContractAdapter(target, 'hey-api-typescript');
  assert.equal(audit.passed, false);
  assert.ok(audit.issues.some((issue) => issue.includes('missing expected fragment Audit')));
  assert.ok(audit.issues.some((issue) => issue.includes('missing expected fragment approvable')));
}));
