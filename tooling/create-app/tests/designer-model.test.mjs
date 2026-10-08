import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { compileProjectBlueprint, inspectProjectBlueprintState, loadProjectBlueprint } from '../project.mjs';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const modelFile = resolve(root, 'apps/designer/src/model.ts');
const source = readFileSync(modelFile, 'utf8');
const compiled = stripTypeScriptTypes(source, { mode: 'strip' });
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function rootTree() {
  return {
    id: 'root', kind: 'layout', type: 'stack', props: {}, children: [
      { id: 'left', kind: 'layout', type: 'grid', props: {}, children: [] },
      { id: 'right', kind: 'layout', type: 'split', props: {}, children: [
        { id: 'a', kind: 'widget', type: 'text', props: { text: 'A' } }
      ] }
    ]
  };
}

test('designer model creates deterministic unique nodes and inserts into containers', () => {
  const tree = rootTree();
  const ids = model.collectIds(tree);
  const first = model.createNode('widget', 'button', ids);
  ids.add(first.id);
  const second = model.createNode('widget', 'button', ids);
  assert.equal(first.id, 'buttonWidget1');
  assert.equal(second.id, 'buttonWidget2');
  assert.equal(model.insertNode(tree, 'left', first), true);
  assert.equal(model.findNode(tree, first.id)?.type, 'button');
});

test('designer model enforces split capacity and prevents cyclic reparenting', () => {
  const tree = rootTree();
  assert.equal(model.insertNode(tree, 'right', { id: 'b', kind: 'widget', type: 'text', props: { text: 'B' } }), true);
  assert.equal(model.insertNode(tree, 'right', { id: 'c', kind: 'widget', type: 'text', props: { text: 'C' } }), false);
  assert.equal(model.moveNode(tree, 'right', 'a'), false);
});


test('designer model accepts project registry container widgets as drop targets', () => {
  const tree = rootTree();
  const containers = new Set(['panel', 'example.section']);
  const section = { id: 'section', kind: 'widget', type: 'example.section', props: {}, children: [] };
  assert.equal(model.insertNode(tree, 'left', section, containers), true);
  const child = { id: 'inside', kind: 'widget', type: 'text', props: { text: 'Inside' } };
  assert.equal(model.insertNode(tree, 'section', child, containers), true);
  assert.equal(model.findNode(tree, 'section')?.children?.[0]?.id, 'inside');
});

test('designer model reorders, moves and deletes without replacing root', () => {
  const tree = rootTree();
  assert.equal(model.moveNode(tree, 'a', 'left'), true);
  assert.equal(model.findNode(tree, 'left')?.children?.[0]?.id, 'a');
  assert.equal(model.reorderNode(tree, 'right', -1), true);
  assert.equal(tree.children[0].id, 'right');
  assert.equal(model.removeNode(tree, 'a'), true);
  assert.equal(model.findNode(tree, 'a'), undefined);
  assert.equal(model.removeNode(tree, 'root'), false);
});

test('designer page checks report duplicate ids and broken binding/action references', () => {
  const page = {
    id: 'page', title: 'Page',
    composition: {
      id: 'root', kind: 'layout', type: 'stack', children: [
        { id: 'dup', kind: 'widget', type: 'button', bindings: { disabled: { state: 'missing' } }, events: { press: ['missingAction'] } },
        { id: 'dup', kind: 'widget', type: 'text', props: { text: 'x' } }
      ]
    },
    state: [], actions: []
  };
  const issues = model.pageIssues(page);
  assert.ok(issues.some((issue) => issue.includes('Duplicate node id: dup')));
  assert.ok(issues.some((issue) => issue.includes('unknown state missing')));
  assert.ok(issues.some((issue) => issue.includes('unknown action missingAction')));
});


test('designer mutation round-trips through Project Blueprint validation and compilation', () => {
  const temp = mkdtempSync(join(tmpdir(), 'foundation-designer-roundtrip-'));
  try {
    const sourceDir = resolve(root, 'tooling/create-app/examples/project-blueprint');
    cpSync(sourceDir, temp, { recursive: true });
    const blueprintFile = join(temp, 'foundation.project.json');
    const blueprint = JSON.parse(readFileSync(blueprintFile, 'utf8'));
    const page = blueprint.pages.find((entry) => entry.id === 'overview');
    assert.ok(page?.composition);
    const ids = model.collectIds(page.composition);
    const text = model.createNode('widget', 'text', ids);
    text.props.text = 'Added by Visual Designer round-trip test';
    assert.equal(model.insertNode(page.composition, page.composition.id, text), true);
    writeFileSync(blueprintFile, `${JSON.stringify(blueprint, null, 2)}\n`);

    const loaded = loadProjectBlueprint(blueprintFile);
    assert.equal(loaded.blueprint.foundation.version, '0.21.0');
    const result = compileProjectBlueprint(blueprintFile);
    assert.ok(result.scaffoldOnce > 0);
    const generated = readFileSync(join(temp, 'src/modules/overview/pages/index.route.tsx'), 'utf8');
    assert.match(generated, /Added by Visual Designer round-trip test/);
    assert.deepEqual(inspectProjectBlueprintState(temp).issues, []);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('designer history supports undo/redo and clears redo after a new edit', async () => {
  const historyFile = resolve(root, 'apps/designer/src/history.ts');
  const historySource = stripTypeScriptTypes(readFileSync(historyFile, 'utf8'), { mode: 'strip' });
  const historyModel = await import(`data:text/javascript;base64,${Buffer.from(historySource).toString('base64')}`);
  let history = historyModel.createHistoryState({ value: 1 });
  history = historyModel.commitHistory(history, { value: 2 }, (a, b) => a.value === b.value);
  history = historyModel.commitHistory(history, { value: 3 }, (a, b) => a.value === b.value);
  assert.equal(history.present.value, 3);
  history = historyModel.undoHistory(history);
  assert.equal(history.present.value, 2);
  assert.equal(history.future[0].value, 3);
  history = historyModel.redoHistory(history);
  assert.equal(history.present.value, 3);
  history = historyModel.undoHistory(history);
  history = historyModel.commitHistory(history, { value: 4 }, (a, b) => a.value === b.value);
  assert.equal(history.present.value, 4);
  assert.deepEqual(history.future, []);
});

test('reference-safe state rename updates bindings, actions and operations without rewriting ordinary body fields', () => {
  const page = {
    id: 'page', title: 'Page',
    composition: { id: 'root', kind: 'layout', type: 'stack', children: [
      { id: 'input', kind: 'widget', type: 'input', bindings: { value: { state: 'mode' } } }
    ] },
    state: [
      { id: 'mode', type: 'string', initial: '' },
      { id: 'pending', type: 'boolean', initial: false },
      { id: 'error', type: 'string', initial: '' }
    ],
    actions: [{ id: 'copy', steps: [
      { type: 'set', state: 'error', value: { state: 'mode' } },
      { type: 'reset', state: 'mode' }
    ] }],
    dataSources: [{ id: 'api', type: 'http', method: 'POST', path: '/x', response: 'json' }],
    operations: [{
      id: 'run', source: 'api',
      query: { mode: { $state: 'mode' } },
      body: { state: 'mode', nested: { value: { $state: 'mode' } } },
      lifecycle: { pendingState: 'pending', errorState: 'error' },
      result: [{ state: 'mode', path: 'mode' }]
    }]
  };
  assert.equal(model.renameState(page, 'mode', 'missionMode'), true);
  assert.equal(page.state[0].id, 'missionMode');
  assert.equal(page.composition.children[0].bindings.value.state, 'missionMode');
  assert.equal(page.actions[0].steps[0].value.state, 'missionMode');
  assert.equal(page.actions[0].steps[1].state, 'missionMode');
  assert.equal(page.operations[0].query.mode.$state, 'missionMode');
  assert.equal(page.operations[0].body.nested.value.$state, 'missionMode');
  assert.equal(page.operations[0].body.state, 'mode');
  assert.equal(page.operations[0].result[0].state, 'missionMode');
});

test('reference-safe action/data source/operation rename updates dependent references', () => {
  const page = {
    id: 'page', title: 'Page',
    composition: { id: 'root', kind: 'layout', type: 'stack', children: [
      { id: 'button', kind: 'widget', type: 'button', events: { press: ['runAction'] } }
    ] },
    state: [],
    actions: [{ id: 'runAction', steps: [{ type: 'invoke', operation: 'runOperation' }] }],
    dataSources: [{ id: 'runApi', type: 'http', method: 'POST', path: '/run', response: 'json' }],
    operations: [{ id: 'runOperation', source: 'runApi' }]
  };
  assert.equal(model.renameAction(page, 'runAction', 'startAction'), true);
  assert.deepEqual(page.composition.children[0].events.press, ['startAction']);
  assert.equal(model.renameDataSource(page, 'runApi', 'missionApi'), true);
  assert.equal(page.operations[0].source, 'missionApi');
  assert.equal(model.renameOperation(page, 'runOperation', 'startOperation'), true);
  assert.equal(page.actions[0].steps[0].operation, 'startOperation');
  assert.equal(model.renameNode(page, 'button', 'startButton'), true);
  assert.equal(page.composition.children[0].id, 'startButton');
  assert.equal(model.renameNode(page, 'startButton', 'root'), false);
});
