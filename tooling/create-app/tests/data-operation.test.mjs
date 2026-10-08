import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { normalizeDataOperationModel } from '../data-operation.mjs';
import { normalizeInteractionModel } from '../interaction-model.mjs';
import { normalizeVisualComposition, renderVisualCompositionPage } from '../visual-composition.mjs';
import { compileProjectBlueprint, loadProjectBlueprint } from '../project.mjs';

function state() {
  return [
    { id: 'mode', type: 'string', initial: 'nominal' },
    { id: 'running', type: 'boolean', initial: false },
    { id: 'errorText', type: 'string', initial: '' },
    { id: 'statusText', type: 'string', initial: 'Idle' },
    { id: 'runCount', type: 'number', initial: 0 }
  ];
}

function dataModel() {
  return normalizeDataOperationModel({
    dataSources: [
      { id: 'runApi', type: 'http', method: 'POST', path: '/runs', response: 'json' }
    ],
    operations: [
      {
        id: 'runMission', source: 'runApi', body: { mode: { $state: 'mode' } },
        lifecycle: { pendingState: 'running', errorState: 'errorText' },
        result: [{ state: 'statusText', path: 'status' }]
      }
    ]
  }, state());
}

test('normalizes governed HTTP data sources and operations', () => {
  const model = dataModel();
  assert.equal(model.dataSources[0].method, 'POST');
  assert.deepEqual(model.operations[0].body, { mode: { $state: 'mode' } });
  assert.deepEqual(model.operations[0].lifecycle, { pendingState: 'running', errorState: 'errorText' });
  assert.ok(model.operationIds.has('runMission'));
});

test('rejects unsafe or type-incompatible operation declarations', () => {
  assert.throws(() => normalizeDataOperationModel({
    dataSources: [{ id: 'bad', path: 'https://example.com/run' }]
  }, state()), /API-relative path/);

  assert.throws(() => normalizeDataOperationModel({
    dataSources: [{ id: 'read', method: 'GET', path: '/read' }],
    operations: [{ id: 'readNow', source: 'read', body: { mode: { $state: 'mode' } } }]
  }, state()), /body is not supported for GET/);

  assert.throws(() => normalizeDataOperationModel({
    dataSources: [{ id: 'run', method: 'POST', path: '/run' }],
    operations: [{ id: 'runNow', source: 'run', lifecycle: { pendingState: 'mode' } }]
  }, state()), /pendingState must reference boolean state/);


  assert.throws(() => normalizeDataOperationModel({
    dataSources: [{ id: 'run', method: 'POST', path: '/run' }],
    operations: [{ id: 'runNow', source: 'run', query: { filter: { nested: true } } }]
  }, state()), /query\.filter must be a scalar literal or \$state reference/);
});

test('validates invoke and internal navigate action steps', () => {
  const model = dataModel();
  const interactions = normalizeInteractionModel({
    state: state(),
    actions: [{ id: 'run', steps: [
      { type: 'invoke', operation: 'runMission' },
      { type: 'increment', state: 'runCount' },
      { type: 'navigate', to: '/runs' }
    ] }]
  }, 'page', { operationIds: model.operationIds });
  assert.deepEqual(interactions.actions[0].steps[0], { type: 'invoke', operation: 'runMission' });
  assert.deepEqual(interactions.actions[0].steps[2], { type: 'navigate', to: '/runs' });
  assert.throws(() => normalizeInteractionModel({ state: state(), actions: [{ id: 'bad', steps: [{ type: 'invoke', operation: 'missing' }] }] }, 'page', { operationIds: model.operationIds }), /unknown page operation/);
  assert.throws(() => normalizeInteractionModel({ state: state(), actions: [{ id: 'badNav', steps: [{ type: 'navigate', to: 'https://example.com' }] }] }, 'page', { operationIds: model.operationIds }), /internal router destination/);
});

test('compiles operation lifecycle, response binding and navigation to ordinary React', () => {
  const model = dataModel();
  const interactions = normalizeInteractionModel({
    state: state(),
    actions: [{ id: 'run', steps: [
      { type: 'invoke', operation: 'runMission' },
      { type: 'increment', state: 'runCount' },
      { type: 'navigate', to: '/runs', replace: true }
    ] }]
  }, 'page', { operationIds: model.operationIds });
  const composition = normalizeVisualComposition({
    id: 'run', kind: 'widget', type: 'button', props: { label: 'Run' }, events: { press: ['run'] }
  });
  const source = renderVisualCompositionPage({ title: 'Run', composition, interactions, dataModel: model });
  assert.match(source, /useApiTransport/);
  assert.match(source, /useNavigate/);
  assert.match(source, /const runRunMission = async \(\): Promise<boolean>/);
  assert.match(source, /setRunning\(true\)/);
  assert.match(source, /JSON\.stringify\(\{ "mode": mode \}\)/);
  assert.match(source, /readOperationPath\(payload, "status"\)/);
  assert.match(source, /setStatusText\(result0\)/);
  assert.match(source, /if \(!\(await runRunMission\(\)\)\) return/);
  assert.match(source, /navigate\("\/runs", \{ replace: true \}\)/);
  assert.doesNotMatch(source, /eval\(|new Function/);
});

test('Project Blueprint requires api-transport capability for HTTP operations', () => {
  const root = mkdtempSync(join(tmpdir(), 'foundation-data-operation-'));
  try {
    const file = join(root, 'foundation.project.json');
    writeFileSync(file, JSON.stringify({
      schemaVersion: 1,
      project: { id: 'demo.app', packageName: 'demo-app', title: 'Demo' },
      foundation: { version: '0.21.0', profile: 'minimal', shell: 'sidebar', router: 'browser', deployment: 'none', contract: 'none' },
      pages: [{
        id: 'home', title: 'Home', pattern: 'page', index: true,
        state: [{ id: 'running', type: 'boolean', initial: false }],
        dataSources: [{ id: 'api', method: 'POST', path: '/run' }],
        operations: [{ id: 'run', source: 'api', lifecycle: { pendingState: 'running' } }],
        actions: [{ id: 'go', steps: [{ type: 'invoke', operation: 'run' }] }],
        composition: { id: 'button', kind: 'widget', type: 'button', props: { label: 'Run' }, events: { press: ['go'] } }
      }]
    }, null, 2));
    assert.throws(() => loadProjectBlueprint(file), /missing api-transport capability/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('operation changes use scaffold ownership rules and do not overwrite human edits', () => {
  const root = mkdtempSync(join(tmpdir(), 'foundation-data-operation-project-'));
  try {
    const file = join(root, 'foundation.project.json');
    const blueprint = {
      schemaVersion: 1,
      project: { id: 'demo.app', packageName: 'demo-app', title: 'Demo' },
      foundation: { version: '0.21.0', profile: 'management', shell: 'sidebar', router: 'browser', deployment: 'none', contract: 'none' },
      pages: [{
        id: 'home', title: 'Home', pattern: 'page', index: true,
        state: [{ id: 'running', type: 'boolean', initial: false }, { id: 'status', type: 'string', initial: 'Idle' }],
        dataSources: [{ id: 'api', method: 'POST', path: '/run', response: 'json' }],
        operations: [{ id: 'run', source: 'api', lifecycle: { pendingState: 'running' }, result: [{ state: 'status', path: 'status' }] }],
        actions: [{ id: 'go', steps: [{ type: 'invoke', operation: 'run' }] }],
        composition: { id: 'button', kind: 'widget', type: 'button', props: { label: 'Run' }, events: { press: ['go'] } }
      }]
    };
    writeFileSync(file, JSON.stringify(blueprint, null, 2));
    compileProjectBlueprint(file);
    const pageFile = join(root, 'src/modules/home/pages/index.route.tsx');
    writeFileSync(pageFile, `${readFileSync(pageFile, 'utf8')}\n// human operation customization\n`);
    blueprint.pages[0].dataSources[0].path = '/run-v2';
    writeFileSync(file, JSON.stringify(blueprint, null, 2));
    assert.throws(() => compileProjectBlueprint(file), /scaffold generation changed and the file also has human modifications/);
    assert.match(readFileSync(pageFile, 'utf8'), /human operation customization/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
