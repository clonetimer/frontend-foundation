import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectProject } from '../doctor.mjs';
import { createApp } from '../index.mjs';
import { generateModule } from '../generate.mjs';
import { generateResource } from '../resource.mjs';
import {
  compileProjectBlueprint,
  inspectProjectBlueprintState,
  loadProjectBlueprint,
  initializeProjectBlueprint,
  projectStateFileName
} from '../project.mjs';

function withTemp(fn) {
  const root = mkdtempSync(join(tmpdir(), 'foundation-project-'));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resourceSpec(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'records',
    title: 'Records',
    route: 'records',
    idField: 'id',
    permissions: { read: 'records.read', update: 'records.update' },
    api: {
      list: { method: 'GET', path: 'records' },
      detail: { method: 'GET', path: 'records/{id}' },
      update: { method: 'PUT', path: 'records/{id}' }
    },
    fields: [
      { name: 'id', label: 'ID', type: 'string', list: true, detail: true },
      { name: 'title', label: 'Title', type: 'string', list: true, detail: true, editable: true, searchable: true }
    ],
    ...overrides
  };
}

function projectBlueprint(overrides = {}) {
  return {
    schemaVersion: 1,
    project: { id: 'demo.app', packageName: 'demo-app', title: 'Demo App' },
    foundation: { profile: 'minimal', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none' },
    theme: { primaryColor: '#123456', layout: { contentPadding: 16 } },
    pages: [
      { id: 'overview', title: 'Overview', pattern: 'dashboard', index: true },
      { id: 'explorer', title: 'Explorer', pattern: 'split-pane', route: 'explorer' }
    ],
    navigation: {
      items: [
        { target: 'overview', label: 'Overview', order: 0 },
        { target: 'explorer', label: 'Explore', order: 10 }
      ]
    },
    resources: [],
    ...overrides
  };
}

test('validates and compiles a complete Project Blueprint into normal Foundation source', () => withTemp((root) => {
  mkdirSync(join(root, 'resources'));
  writeJson(join(root, 'resources/records.resource.json'), resourceSpec());
  const blueprint = projectBlueprint({
    foundation: { profile: 'management', shell: 'top-nav', router: 'browser', deployment: 'none', contract: 'none' },
    resources: [{ source: 'resources/records.resource.json' }],
    navigation: {
      items: [
        { target: 'overview', label: 'Overview', order: 0 },
        { target: 'records', label: 'Record Center', order: 10 },
        { target: 'explorer', label: 'Explore', order: 20 }
      ]
    }
  });
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint);

  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.blueprint.foundation.shell, 'top-nav');
  assert.equal(loaded.blueprint.resources[0].source, 'resources/records.resource.json');
  assert.equal(loaded.blueprint.navigation.items[1].label, 'Record Center');

  const result = compileProjectBlueprint(blueprintFile);
  assert.equal(result.project, 'demo.app');
  assert.ok(result.generatedOwned > 0);
  assert.ok(result.scaffoldOnce > 0);

  const application = readFileSync(join(root, 'src/app/application.ts'), 'utf8');
  const theme = readFileSync(join(root, 'src/app/project-theme.ts'), 'utf8');
  const indexRoute = readFileSync(join(root, 'src/modules/overview/routes.ts'), 'utf8');
  const resourceRoute = readFileSync(join(root, 'src/modules/records/routes.ts'), 'utf8');
  assert.match(application, /shell: \{ preset: 'top-nav' \}/);
  assert.match(application, /projectBrandTheme/);
  assert.match(theme, /#123456/);
  assert.match(indexRoute, /index: true/);
  assert.match(resourceRoute, /label: "Record Center", order: 10/);

  const state = JSON.parse(readFileSync(join(root, projectStateFileName), 'utf8'));
  assert.equal(state.files['src/app/project-theme.ts'].ownership, 'generated-owned');
  assert.equal(state.files['src/modules/records/api.ts'].ownership, 'scaffold-once');
  assert.equal(state.files['src/modules/overview/pages/index.route.tsx'].ownership, 'scaffold-once');

  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
  const doctor = inspectProject(root, { target: loaded.blueprint.foundation.version });
  assert.deepEqual(doctor.issues, []);
  assert.deepEqual(doctor.warnings, []);
}));

test('preserves human edits when scaffold output is unchanged and updates generated-owned files', () => withTemp((root) => {
  const blueprintFile = join(root, 'foundation.project.json');
  const blueprint = projectBlueprint();
  writeJson(blueprintFile, blueprint);
  compileProjectBlueprint(blueprintFile);

  const pageFile = join(root, 'src/modules/overview/pages/index.route.tsx');
  const edited = `${readFileSync(pageFile, 'utf8')}\n// human edit\n`;
  writeFileSync(pageFile, edited, 'utf8');

  compileProjectBlueprint(blueprintFile);
  assert.equal(readFileSync(pageFile, 'utf8'), edited);

  blueprint.theme.primaryColor = '#654321';
  writeJson(blueprintFile, blueprint);
  compileProjectBlueprint(blueprintFile);
  assert.equal(readFileSync(pageFile, 'utf8'), edited);
  assert.match(readFileSync(join(root, 'src/app/project-theme.ts'), 'utf8'), /#654321/);
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
}));

test('blocks modified generated-owned files unless force-generated is explicit', () => withTemp((root) => {
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, projectBlueprint());
  compileProjectBlueprint(blueprintFile);

  const themeFile = join(root, 'src/app/project-theme.ts');
  writeFileSync(themeFile, `${readFileSync(themeFile, 'utf8')}\n// local generated edit\n`, 'utf8');
  const status = inspectProjectBlueprintState(root);
  assert.ok(status.issues.some((message) => message.includes('generated-owned drift')));
  assert.throws(() => compileProjectBlueprint(blueprintFile), /generated-owned file was modified/);

  compileProjectBlueprint(blueprintFile, { forceGenerated: true });
  assert.doesNotMatch(readFileSync(themeFile, 'utf8'), /local generated edit/);
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
}));

test('blocks unsafe regeneration when a changed Resource Blueprint intersects human scaffold edits', () => withTemp((root) => {
  mkdirSync(join(root, 'resources'));
  const resourceFile = join(root, 'resources/records.resource.json');
  writeJson(resourceFile, resourceSpec());
  const blueprint = projectBlueprint({
    foundation: { profile: 'management', shell: 'sidebar', router: 'browser', deployment: 'none', contract: 'none' },
    pages: [{ id: 'overview', title: 'Overview', pattern: 'dashboard', index: true }],
    resources: [{ source: 'resources/records.resource.json' }],
    navigation: { items: [
      { target: 'overview', label: 'Overview', order: 0 },
      { target: 'records', label: 'Records', order: 10 }
    ] }
  });
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint);
  compileProjectBlueprint(blueprintFile);

  const apiFile = join(root, 'src/modules/records/api.ts');
  writeFileSync(apiFile, `${readFileSync(apiFile, 'utf8')}\n// custom API behavior\n`, 'utf8');
  const changed = resourceSpec();
  changed.api.list.path = 'records-v2';
  writeJson(resourceFile, changed);

  const drift = inspectProjectBlueprintState(root);
  assert.ok(drift.issues.some((message) => message.includes('Project Blueprint inputs changed')));
  assert.throws(() => compileProjectBlueprint(blueprintFile), /scaffold generation changed and the file also has human modifications/);
  assert.match(readFileSync(apiFile, 'utf8'), /custom API behavior/);
}));

test('rejects incomplete, capability-incompatible and route-conflicting Project Blueprints', () => withTemp((root) => {
  const blueprintFile = join(root, 'foundation.project.json');
  const missingIndex = projectBlueprint({ pages: [{ id: 'only', title: 'Only', pattern: 'page', route: 'only' }] });
  delete missingIndex.navigation;
  writeJson(blueprintFile, missingIndex);
  assert.throws(() => loadProjectBlueprint(blueprintFile), /exactly one index page/);

  const duplicateRoute = projectBlueprint({
    pages: [
      { id: 'home', title: 'Home', pattern: 'page', index: true },
      { id: 'alpha', title: 'Alpha', pattern: 'page', route: 'same' },
      { id: 'beta', title: 'Beta', pattern: 'page', route: 'same' }
    ],
    navigation: undefined
  });
  writeJson(blueprintFile, duplicateRoute);
  assert.throws(() => loadProjectBlueprint(blueprintFile), /Duplicate project route same/);

  mkdirSync(join(root, 'resources'), { recursive: true });
  writeJson(join(root, 'resources/records.resource.json'), resourceSpec());
  const incompatible = projectBlueprint({ resources: [{ source: 'resources/records.resource.json' }], navigation: undefined });
  writeJson(blueprintFile, incompatible);
  assert.throws(() => loadProjectBlueprint(blueprintFile), /Resource records requires missing capabilities/);

  const olderLine = projectBlueprint({ foundation: { profile: 'minimal', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none', version: '0.16.0' } });
  writeJson(blueprintFile, olderLine);
  assert.throws(() => loadProjectBlueprint(blueprintFile), /targets Foundation 0\.21\.x/);
}));


test('plans and writes an explicit migration path for existing Foundation projects', () => withTemp((root) => {
  createApp([root, '--profile', 'management', '--shell', 'top-nav', '--title', 'Legacy Console', '--foundation-version', '0.12.0']);
  generateModule(['module', 'reports', '--project', root, '--pattern', 'split-pane', '--title', 'Reports', '--route', 'reports', '--order', '20']);
  const legacyResource = join(root, 'legacy.records.json');
  writeJson(legacyResource, resourceSpec());
  generateResource(root, legacyResource);

  const plan = initializeProjectBlueprint(root);
  assert.equal(plan.written.length, 0);
  assert.equal(plan.blueprint.project.title, 'Legacy Console');
  assert.equal(plan.blueprint.foundation.shell, 'top-nav');
  assert.equal(plan.blueprint.foundation.version, '0.21.0');
  assert.ok(plan.warnings.some((warning) => warning.includes('0.12.0') && warning.includes('0.21.0')));
  assert.ok(plan.blueprint.pages.some((page) => page.id === 'home' && page.index));
  assert.ok(plan.blueprint.pages.some((page) => page.id === 'reports' && page.route === 'reports'));
  assert.deepEqual(plan.blueprint.resources, [{ source: 'resources/records.resource.json' }]);

  const written = initializeProjectBlueprint(root, { write: true });
  assert.ok(written.written.includes('foundation.project.json'));
  assert.ok(written.written.includes('resources/records.resource.json'));
  assert.throws(() => compileProjectBlueprint(join(root, 'foundation.project.json')), /existing file is not owned by the Project Compiler/);

  const adopted = compileProjectBlueprint(join(root, 'foundation.project.json'), { forceGenerated: true });
  assert.ok(adopted.humanOwned > 0);
  assert.deepEqual(inspectProjectBlueprintState(root).issues, []);
  const doctor = inspectProject(root, { target: plan.blueprint.foundation.version });
  assert.deepEqual(doctor.issues, []);
  assert.deepEqual(doctor.warnings, []);
}));

test('compiles page visual composition trees into editable TSX and protects human scaffold edits', () => withTemp((root) => {
  const blueprint = projectBlueprint({
    pages: [
      {
        id: 'overview', title: 'Overview', pattern: 'page', index: true,
        composition: {
          id: 'root', kind: 'layout', type: 'stack', props: { gap: 16 }, children: [
            { id: 'title', kind: 'widget', type: 'text', props: { text: 'Operations', variant: 'title' } },
            {
              id: 'workspace', kind: 'layout', type: 'split', props: { secondarySize: 320 }, children: [
                { id: 'main', kind: 'widget', type: 'placeholder', props: { title: 'Primary workspace' } },
                { id: 'side', kind: 'widget', type: 'panel', props: { title: 'Inspector' }, children: [
                  { id: 'filter', kind: 'widget', type: 'select', props: { label: 'Mode', options: [{ label: 'Nominal', value: 'nominal' }] } }
                ] }
              ]
            }
          ]
        }
      }
    ],
    navigation: { items: [{ target: 'overview', label: 'Overview', order: 0 }] }
  });
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint);
  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.blueprint.pages[0].composition.type, 'stack');

  compileProjectBlueprint(blueprintFile);
  const pageFile = join(root, 'src/modules/overview/pages/index.route.tsx');
  const page = readFileSync(pageFile, 'utf8');
  assert.match(page, /StackLayout/);
  assert.match(page, /SplitLayout/);
  assert.match(page, /SelectWidget/);
  assert.match(page, /foundation-node:workspace/);
  assert.doesNotMatch(page, /VisualRenderer/);

  const state = JSON.parse(readFileSync(join(root, projectStateFileName), 'utf8'));
  assert.equal(state.files['src/modules/overview/pages/index.route.tsx'].ownership, 'scaffold-once');

  writeFileSync(pageFile, `${page}\n// human composition customization\n`, 'utf8');
  blueprint.pages[0].composition.children[0].props.text = 'Operations Center';
  writeJson(blueprintFile, blueprint);
  assert.throws(() => compileProjectBlueprint(blueprintFile), /scaffold generation changed and the file also has human modifications/);
  assert.match(readFileSync(pageFile, 'utf8'), /human composition customization/);
}));

test('compiles Project Blueprint action/binding connections into editable React state and callbacks', () => withTemp((root) => {
  const blueprint = projectBlueprint({
    pages: [
      {
        id: 'overview',
        title: 'Overview',
        pattern: 'page',
        index: true,
        state: [
          { id: 'name', type: 'string', initial: '' },
          { id: 'running', type: 'boolean', initial: false },
          { id: 'runCount', type: 'number', initial: 0 }
        ],
        actions: [
          { id: 'updateName', steps: [{ type: 'set', state: 'name', value: { event: 'value' } }] },
          { id: 'run', steps: [{ type: 'toggle', state: 'running' }, { type: 'increment', state: 'runCount' }] }
        ],
        composition: {
          id: 'root', kind: 'layout', type: 'stack', children: [
            {
              id: 'nameInput', kind: 'widget', type: 'input', props: { label: 'Name' },
              bindings: { value: { state: 'name' } }, events: { change: ['updateName'] }
            },
            {
              id: 'runButton', kind: 'widget', type: 'button', props: { label: 'Run' },
              bindings: { disabled: { state: 'running' } }, events: { press: ['run'] }
            },
            {
              id: 'count', kind: 'widget', type: 'metric', props: { label: 'Runs', value: 0 },
              bindings: { value: { state: 'runCount' } }
            }
          ]
        }
      }
    ],
    navigation: { items: [{ target: 'overview', label: 'Overview', order: 0 }] }
  });
  const blueprintFile = join(root, 'foundation.project.json');
  writeJson(blueprintFile, blueprint);

  const loaded = loadProjectBlueprint(blueprintFile);
  assert.equal(loaded.blueprint.pages[0].state.length, 3);
  assert.equal(loaded.blueprint.pages[0].actions.length, 2);

  compileProjectBlueprint(blueprintFile);
  const page = readFileSync(join(root, 'src/modules/overview/pages/index.route.tsx'), 'utf8');
  assert.match(page, /useState\(""\)/);
  assert.match(page, /value=\{name\}/);
  assert.match(page, /onValueChange=\{\(value\) => \{ setName\(value\); \}\}/);
  assert.match(page, /onPress=\{\(\) => \{ setRunning\(\(current\) => !current\); setRunCount\(\(current\) => current \+ 1\); \}\}/);
}));
