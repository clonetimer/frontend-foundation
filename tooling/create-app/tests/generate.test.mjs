import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../index.mjs';
import { generateContracts } from '../contract.mjs';
import { generateModule, listComposition, listPatterns } from '../generate.mjs';


function installFakeHeyApi(projectRoot, version = '0.99.0') {
  const dir = join(projectRoot, 'node_modules', '@hey-api', 'openapi-ts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@hey-api/openapi-ts',
    version,
    type: 'module',
    exports: './index.mjs'
  }, null, 2));
  writeFileSync(join(dir, 'index.mjs'), `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export async function createClient(config) {
  const output = typeof config.output === 'string' ? config.output : config.output.path;
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'types.gen.ts'), 'export type Status = { ok: boolean };\\n');
}
`, 'utf8');
}

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-generate-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('lists domain-neutral module patterns', () => {
  assert.deepEqual(listPatterns().map((pattern) => pattern.name), ['page', 'management', 'data-workbench', 'dashboard', 'master-detail', 'split-pane', 'workspace']);
});

test('lists UI composition catalog for project planners', () => {
  const catalog = listComposition();
  assert.deepEqual(catalog.shells.map((entry) => entry.id), ['sidebar', 'top-nav', 'workspace', 'bare']);
  assert.deepEqual(catalog.patterns.map((entry) => entry.id), ['dashboard', 'master-detail', 'split-pane', 'workspace']);
  assert.deepEqual(catalog.layouts.map((entry) => entry.id), ['stack', 'grid', 'split', 'tabs']);
  assert.deepEqual(catalog.widgets.map((entry) => entry.id), ['panel', 'text', 'button', 'input', 'select', 'metric', 'placeholder']);
  assert.deepEqual(catalog.blocks.map((entry) => entry.id), ['panel', 'metric', 'metric-grid']);
  const machineReadable = generateModule(['--list-composition', '--json']);
  assert.equal(machineReadable.json, true);
  assert.equal(machineReadable.composition.layouts[0].id, 'stack');
  const button = machineReadable.composition.widgets.find((entry) => entry.id === 'button');
  const input = machineReadable.composition.widgets.find((entry) => entry.id === 'input');
  assert.equal(button.events.press.prop, 'onPress');
  assert.equal(button.bindings.disabled, 'boolean');
  assert.equal(input.events.change.valueType, 'string');
  assert.equal(input.bindings.value, 'string');
  const split = machineReadable.composition.layouts.find((entry) => entry.id === 'split');
  assert.deepEqual(split.properties.find((property) => property.key === 'direction').options, ['horizontal', 'vertical']);
  assert.equal(button.properties.find((property) => property.key === 'disabled').kind, 'boolean');
  assert.equal(input.properties.find((property) => property.key === 'placeholder').kind, 'text');
  for (const entry of [...machineReadable.composition.layouts, ...machineReadable.composition.widgets]) {
    assert.ok(Array.isArray(entry.properties), `${entry.id} must expose Designer property metadata`);
    assert.equal(new Set(entry.properties.map((property) => property.key)).size, entry.properties.length, `${entry.id} property keys must be unique`);
    for (const property of entry.properties) {
      assert.match(property.key, /^[A-Za-z][A-Za-z0-9]*$/);
      assert.ok(['text', 'number', 'boolean', 'select', 'json'].includes(property.kind), `${entry.id}.${property.key} uses an unsupported Designer property kind`);
      if (property.kind === 'select') assert.ok(Array.isArray(property.options) && property.options.length > 0, `${entry.id}.${property.key} select properties need options`);
    }
  }
  assert.deepEqual(machineReadable.composition.interaction.actionSteps, ['set', 'toggle', 'increment', 'reset', 'invoke', 'navigate']);
  assert.equal(machineReadable.composition.interaction.dataSources[0].type, 'http');
});

test('generates a page module without editing application composition', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal']);
  const before = readFileSync(join(root, 'src/app/application.ts'), 'utf8');
  const result = generateModule(['module', 'reports', '--project', root, '--pattern', 'page', '--title', 'Reports', '--route', 'reports']);
  const after = readFileSync(join(root, 'src/app/application.ts'), 'utf8');
  assert.equal(before, after);
  assert.equal(result.module, 'reports');
  assert.match(readFileSync(join(root, 'src/modules/reports/routes.ts'), 'utf8'), /export const module/);
  assert.match(readFileSync(join(root, 'src/modules/reports/pages/index.route.tsx'), 'utf8'), /Reports/);
  const manifest = JSON.parse(readFileSync(join(root, 'src/modules/reports/foundation.module.json'), 'utf8'));
  assert.equal(manifest.pattern, 'page');
  assert.deepEqual(manifest.requiredCapabilities, ['application-shell', 'ui-patterns']);
  assert.deepEqual(manifest.contracts, []);
}));

test('blocks patterns whose capabilities are not in the project profile', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal']);
  assert.throws(() => generateModule(['module', 'records', '--project', root, '--pattern', 'management']), /missing capabilities/);
}));

test('generates management pattern in management profile', () => withTemp((root) => {
  createApp([root, '--profile', 'management']);
  generateModule(['module', 'records', '--project', root, '--pattern', 'management', '--permission', 'records.update']);
  const page = readFileSync(join(root, 'src/modules/records/pages/index.route.tsx'), 'utf8');
  const route = readFileSync(join(root, 'src/modules/records/routes.ts'), 'utf8');
  assert.match(page, /@foundation\/data/);
  assert.match(page, /@foundation\/forms/);
  assert.match(page, /@foundation\/security/);
  assert.match(route, /permission: "records\.update"/);
}));

test('generates data workbench pattern in data-workbench profile', () => withTemp((root) => {
  createApp([root, '--profile', 'data-workbench']);
  generateModule(['module', 'analysis', '--project', root, '--pattern', 'data-workbench']);
  const page = readFileSync(join(root, 'src/modules/analysis/pages/index.route.tsx'), 'utf8');
  assert.match(page, /@foundation\/async/);
  assert.match(page, /@foundation\/file/);
  assert.match(page, /@foundation\/visualization/);
}));

test('generates dashboard, master-detail and workspace composition patterns in minimal profile', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal', '--shell', 'top-nav']);
  for (const pattern of ['dashboard', 'master-detail', 'split-pane', 'workspace']) {
    generateModule(['module', pattern, '--project', root, '--pattern', pattern]);
    const page = readFileSync(join(root, `src/modules/${pattern}/pages/index.route.tsx`), 'utf8');
    assert.match(page, /@foundation\/ui/);
  }
  assert.match(readFileSync(join(root, 'src/modules/dashboard/pages/index.route.tsx'), 'utf8'), /DashboardPattern/);
  assert.match(readFileSync(join(root, 'src/modules/master-detail/pages/index.route.tsx'), 'utf8'), /MasterDetailPattern/);
  assert.match(readFileSync(join(root, 'src/modules/split-pane/pages/index.route.tsx'), 'utf8'), /SplitPanePattern/);
  assert.match(readFileSync(join(root, 'src/modules/workspace/pages/index.route.tsx'), 'utf8'), /WorkspacePattern/);
}));

test('rejects duplicate route paths and unsafe paths', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal']);
  generateModule(['module', 'first', '--project', root, '--route', 'shared']);
  assert.throws(() => generateModule(['module', 'second', '--project', root, '--route', 'shared']), /already declared/);
  assert.throws(() => generateModule(['module', 'bad', '--project', root, '--route', '../bad']), /Invalid route path/);
}));



test('generates an explicit index module with independent navigation label', () => withTemp((root) => {
  createApp([root, '--profile', 'minimal']);
  rmSync(join(root, 'src/modules/home'), { recursive: true, force: true });
  const result = generateModule(['module', 'overview', '--project', root, '--pattern', 'dashboard', '--title', 'Overview Page', '--nav-label', 'Overview', '--index', '--order', '0']);
  assert.equal(result.index, true);
  const route = readFileSync(join(root, 'src/modules/overview/routes.ts'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'src/modules/overview/foundation.module.json'), 'utf8'));
  assert.match(route, /index: true/);
  assert.match(route, /label: "Overview", order: 0/);
  assert.deepEqual(manifest.route, { index: true });
  assert.throws(() => generateModule(['module', 'second-home', '--project', root, '--index']), /Index route is already declared/);
}));

test('binds generated modules only to ready project contracts', () => withTemp((root) => {
  createApp([root, '--profile', 'management', '--contract', 'openapi']);
  assert.throws(
    () => generateModule(['module', 'records', '--project', root, '--pattern', 'management', '--contract', 'api']),
    /Contract dependencies are not ready/
  );

  installFakeHeyApi(root);
  generateContracts(root);
  const result = generateModule(['module', 'records', '--project', root, '--pattern', 'management', '--contract', 'api']);
  assert.deepEqual(result.contracts, ['api']);
  const manifest = JSON.parse(readFileSync(join(root, 'src/modules/records/foundation.module.json'), 'utf8'));
  assert.deepEqual(manifest.contracts, ['api']);
  assert.throws(
    () => generateModule(['module', 'other', '--project', root, '--contract', 'missing']),
    /Unknown project contract missing/
  );
}));
