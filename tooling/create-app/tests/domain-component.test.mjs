import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initDomainPackage, mergeDomainRegistries, verifyDomainPackage, versionRangeIncludes } from '../domain-component.mjs';

async function temp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-domain-sdk-'));
  try { return await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

test('semantic version admission accepts exact caret and tilde ranges', () => {
  assert.equal(versionRangeIncludes('1.2.3', '1.2.3'), true);
  assert.equal(versionRangeIncludes('^1.2.3', '1.9.0'), true);
  assert.equal(versionRangeIncludes('^1.2.3', '2.0.0'), false);
  assert.equal(versionRangeIncludes('~1.2.3', '1.2.9'), true);
  assert.equal(versionRangeIncludes('~1.2.3', '1.3.0'), false);
  assert.equal(versionRangeIncludes('^0.2.1', '0.2.7'), true);
  assert.equal(versionRangeIncludes('^0.2.1', '0.3.0'), false);
});

test('init creates a package-level Custom Registry and verifiable source export', async () => temp(async (root) => {
  const target = join(root, 'widgets');
  initDomainPackage(target, { packageName: '@acme/widgets', namespace: 'acme' });
  const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(join(target, 'foundation.registry.json'), 'utf8'));
  assert.equal(manifest.name, '@acme/widgets');
  assert.equal(registry.blocks[0].id, 'acme.domain-panel');
  const result = await verifyDomainPackage(target);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.componentCount, 1);
}));

test('verify rejects package identity, range, and missing source export drift', async () => temp(async (root) => {
  const target = join(root, 'widgets');
  initDomainPackage(target, { packageName: '@acme/widgets', namespace: 'acme' });
  const registryFile = join(target, 'foundation.registry.json');
  const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
  registry.blocks[0].package = '@wrong/widgets';
  registry.blocks[0].version = '^2.0.0';
  registry.blocks[0].exportName = 'MissingPanel';
  writeJson(registryFile, registry);
  const result = await verifyDomainPackage(target);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((entry) => entry.code === 'DOMAIN_REGISTRY_INVALID' && entry.message.includes('@wrong/widgets')));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'DOMAIN_REGISTRY_INVALID' && entry.message.includes('does not include')));
  assert.ok(result.diagnostics.some((entry) => entry.code === 'DOMAIN_EXPORT_MISSING' && entry.message.includes('MissingPanel')));
}));

test('built verification checks actual package exports', async () => temp(async (root) => {
  const target = join(root, 'widgets');
  initDomainPackage(target, { packageName: '@acme/widgets', namespace: 'acme' });
  mkdirSync(join(target, 'dist'), { recursive: true });
  writeFileSync(join(target, 'dist', 'index.js'), 'export function DomainPanel() { return null; }\n', 'utf8');
  writeFileSync(join(target, 'dist', 'index.d.ts'), 'export declare function DomainPanel(): null;\n', 'utf8');
  const result = await verifyDomainPackage(target, { built: true });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
}));

test('registry merge preserves categories and rejects duplicate ids', () => temp((root) => {
  const a = join(root, 'a.json');
  const b = join(root, 'b.json');
  const out = join(root, 'merged.json');
  writeJson(a, { schemaVersion: 1, widgets: [{ id: 'example.viewer', package: '@example/domain-widgets', version: '^1.0.0', exportName: 'Viewer', description: 'Viewer' }] });
  writeJson(b, { schemaVersion: 1, blocks: [{ id: 'analysis.section', package: '@analysis/widgets', version: '^1.0.0', exportName: 'Section', description: 'Section', acceptsChildren: true }] });
  const merged = mergeDomainRegistries([a, b], out);
  assert.equal(merged.widgets[0].id, 'example.viewer');
  assert.equal(merged.blocks[0].id, 'analysis.section');
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).blocks[0].exportName, 'Section');
  assert.throws(() => mergeDomainRegistries([a, a], join(root, 'bad.json')), /Duplicate custom component id/);
}));


test('independently authored secondary domain package validates the SDK vocabulary without using the retained workspace fixture', async () => {
  const target = join(import.meta.dirname, '../../fixtures/secondary-domain-widgets');
  const result = await verifyDomainPackage(target);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.package, '@example/secondary-controls');
  assert.equal(result.version, '0.3.0');
  assert.equal(result.componentCount, 2);
});
