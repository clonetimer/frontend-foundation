import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import test from 'node:test';
import { normalizeCustomRegistry } from '../custom-registry.mjs';
import { compileProjectBlueprint, diagnoseProjectBlueprint, inspectProjectBlueprintState, loadProjectBlueprint } from '../project.mjs';

const builtIn = { widgets: [{ id: 'button' }, { id: 'text' }] };

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-custom-registry-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

function registry(overrides = {}) {
  return {
    schemaVersion: 1,
    widgets: [{
      id: 'example.interactive-viewer',
      package: '@example/domain-widgets',
      version: '^2.0.0',
      exportName: 'InteractiveViewer',
      description: 'Interactive viewer',
      properties: [
        { key: 'itemId', label: 'Item', kind: 'text', required: true },
        { key: 'mode', label: 'Mode', kind: 'select', options: ['overview', 'detail'], default: 'overview' }
      ],
      bindings: { itemId: 'string' },
      events: { select: { prop: 'onSelect', valueType: 'string', parameter: 'value' } }
    }],
    blocks: [],
    ...overrides
  };
}

function blueprint() {
  return {
    schemaVersion: 1,
    project: { id: 'example.console', packageName: 'example-console', title: 'Example Console' },
    foundation: { version: '0.21.0', profile: 'management', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none' },
    navigation: { items: [{ target: 'overview', label: 'Overview', order: 0 }] },
    pages: [{
      id: 'overview', title: 'Overview', pattern: 'dashboard', index: true,
      state: [{ id: 'itemId', type: 'string', initial: 'ITEM-1' }],
      actions: [{ id: 'selectItem', steps: [{ type: 'set', state: 'itemId', value: { event: 'value' } }] }],
      composition: {
        id: 'root', kind: 'layout', type: 'stack', children: [{
          id: 'overview', kind: 'widget', type: 'example.interactive-viewer',
          props: { mode: 'overview' },
          bindings: { itemId: { state: 'itemId' } },
          events: { select: ['selectItem'] }
        }]
      }
    }],
    resources: []
  };
}

test('normalizes namespaced custom widgets and blocks with governed props/bindings/events', () => {
  const normalized = normalizeCustomRegistry(registry(), builtIn);
  assert.equal(normalized.definitions.length, 1);
  assert.equal(normalized.definitions[0].id, 'example.interactive-viewer');
  assert.equal(normalized.packages['@example/domain-widgets'], '^2.0.0');
  assert.equal(normalized.definitions[0].events.select.prop, 'onSelect');
  assert.equal(normalized.definitions[0].properties[1].default, 'overview');
});

test('rejects unsafe custom registry declarations and built-in collisions', () => {
  assert.throws(() => normalizeCustomRegistry(registry({ widgets: [{ id: 'button', package: '@x/y', version: '1.0.0', exportName: 'X', description: 'x' }] }), builtIn), /namespaced id|conflicts/);
  assert.throws(() => normalizeCustomRegistry(registry({ widgets: [{ id: 'example.viewer', package: '@x/y', version: '1.0.0', exportName: 'Viewer', description: 'x', properties: [{ key: 'children', label: 'Children', kind: 'text' }] }] }), builtIn), /cannot be children/);
  assert.throws(() => normalizeCustomRegistry(registry({ widgets: [{ id: 'example.viewer', package: '@x/y', version: '1.0.0', exportName: 'Viewer', description: 'x', properties: [{ key: 'mode', label: 'Mode', kind: 'text' }], bindings: { missing: 'string' } }] }), builtIn), /must reference a declared property/);
});


test('required custom widget properties may be satisfied by a governed state binding but not omitted entirely', () => withTemp((root) => {
  writeJson(join(root, 'foundation.registry.json'), registry());
  const blueprintFile = join(root, 'foundation.project.json');
  const valid = blueprint();
  writeJson(blueprintFile, valid);
  assert.doesNotThrow(() => loadProjectBlueprint(blueprintFile));

  const invalid = blueprint();
  delete invalid.pages[0].composition.children[0].bindings;
  writeJson(blueprintFile, invalid);
  assert.throws(() => loadProjectBlueprint(blueprintFile), /itemId is required/);
}));

test('Project Compiler emits custom widget imports, dependencies, bindings and events', () => withTemp((root) => {
  writeJson(join(root, 'foundation.registry.json'), registry());
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint());

  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.customRegistry.registry.definitions[0].id, 'example.interactive-viewer');
  const result = compileProjectBlueprint(blueprintFile);
  assert.ok(result.scaffoldOnce > 0);

  const page = readFileSync(join(root, 'src/modules/overview/pages/index.route.tsx'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(page, /import \{ InteractiveViewer \} from "@example\/domain-widgets";/);
  assert.match(page, /itemId=\{itemId\}/);
  assert.match(page, /onSelect=\{\(value\) => \{ setItemId\(value\); \}\}/);
  assert.equal(manifest.dependencies['@example/domain-widgets'], '^2.0.0');
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
}));


test('retained domain-neutral fixture registry compiles through the real Project Compiler contract', () => withTemp((root) => {
  const fixtureRegistry = JSON.parse(readFileSync(new URL('../../../packages/domain-widgets-fixture/foundation.registry.json', import.meta.url), 'utf8'));
  writeJson(join(root, 'foundation.registry.json'), fixtureRegistry);
  const project = blueprint();
  project.pages[0].composition.children[0].props = { mode: 'overview', interactive: true };
  project.pages[0].composition.children[0].events = { focus: ['selectItem'] };
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, project);

  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.customRegistry.registry.definitions.find((entry) => entry.id === 'example.interactive-viewer')?.package, '@example/domain-widgets');
  compileProjectBlueprint(blueprintFile);

  const page = readFileSync(join(root, 'src/modules/overview/pages/index.route.tsx'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(page, /import \{ InteractiveViewer \} from "@example\/domain-widgets";/);
  assert.match(page, /onItemChange=\{\(itemId\) => \{ setItemId\(itemId\); \}\}/);
  assert.equal(manifest.dependencies['@example/domain-widgets'], '^0.1.0');
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
}));

test('foundation-project diagnose --json exposes stable machine-readable compiler diagnostics', () => withTemp((root) => {
  writeJson(join(root, 'foundation.registry.json'), { schemaVersion: 1, widgets: [{ id: 'bad', package: '@x/y', version: '1.0.0', exportName: 'Viewer', description: 'bad' }] });
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint());
  const cli = spawnSync(process.execPath, [new URL('../project.mjs', import.meta.url).pathname, 'diagnose', blueprintFile, '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  const result = JSON.parse(cli.stdout);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, 'REGISTRY_INVALID');
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(result.diagnostics[0].source, 'foundation.registry.json');
}));

test('custom registry participates in input drift detection and diagnostics', () => withTemp((root) => {
  const registryFile = join(root, 'foundation.registry.json');
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(registryFile, registry());
  writeJson(blueprintFile, blueprint());
  compileProjectBlueprint(blueprintFile);

  const changed = registry();
  changed.widgets[0].description = 'Changed description';
  writeJson(registryFile, changed);
  assert.ok(inspectProjectBlueprintState(root).issues.some((message) => message.includes('Project Blueprint inputs changed')));

  writeJson(registryFile, { schemaVersion: 1, widgets: [{ id: 'bad', package: '@x/y', version: '1', exportName: 'Viewer', description: 'bad' }] });
  const diagnosed = diagnoseProjectBlueprint(blueprintFile);
  assert.equal(diagnosed.valid, false);
  assert.equal(diagnosed.diagnostics[0].code, 'REGISTRY_INVALID');
  assert.equal(diagnosed.diagnostics[0].source, 'foundation.registry.json');
}));


test('second independently authored domain Registry compiles distinct property, binding, event, and child-container shapes', () => withTemp((root) => {
  const fixtureRegistry = JSON.parse(readFileSync(new URL('../../fixtures/secondary-domain-widgets/foundation.registry.json', import.meta.url), 'utf8'));
  writeJson(join(root, 'foundation.registry.json'), fixtureRegistry);
  const project = blueprint();
  project.pages[0].state = [
    { id: 'label', type: 'string', initial: 'Queue' },
    { id: 'count', type: 'number', initial: 2 },
    { id: 'collapsed', type: 'boolean', initial: false }
  ];
  project.pages[0].actions = [
    { id: 'acknowledge', steps: [{ type: 'increment', state: 'count' }] },
    { id: 'syncCollapsed', steps: [{ type: 'set', state: 'collapsed', value: { event: 'value' } }] }
  ];
  project.pages[0].composition = {
    id: 'root', kind: 'layout', type: 'stack', children: [{
      id: 'inspector', kind: 'widget', type: 'secondary.inspector-frame',
      props: { title: 'Inspector', width: 360 },
      bindings: { collapsed: { state: 'collapsed' } },
      events: { collapseChanged: ['syncCollapsed'] },
      children: [{
        id: 'priority', kind: 'widget', type: 'secondary.priority-badge',
        props: { level: 'high', muted: false },
        bindings: { label: { state: 'label' }, count: { state: 'count' } },
        events: { acknowledge: ['acknowledge'] }
      }]
    }]
  };
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, project);

  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.customRegistry.registry.definitions.length, 2);
  compileProjectBlueprint(blueprintFile);

  const page = readFileSync(join(root, 'src/modules/overview/pages/index.route.tsx'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(page, /import \{ InspectorFrame, PriorityBadge \} from "@example\/secondary-controls";/);
  assert.match(page, /collapsed=\{collapsed\}/);
  assert.match(page, /onCollapseChange=\{\(collapsed\) => \{ setCollapsed\(collapsed\); \}\}/);
  assert.match(page, /onAcknowledge=\{\(\) => \{ setCount\(\(current\) => current \+ 1\); \}\}/);
  assert.equal(manifest.dependencies['@example/secondary-controls'], '^0.3.0');
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
}));
