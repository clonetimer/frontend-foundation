import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeInteractionModel, validateCompositionInteractions } from '../interaction-model.mjs';
import { normalizeVisualComposition, renderVisualCompositionPage } from '../visual-composition.mjs';

function interactiveComposition() {
  return {
    id: 'root',
    kind: 'layout',
    type: 'stack',
    children: [
      {
        id: 'mode',
        kind: 'widget',
        type: 'select',
        props: {
          label: 'Mode',
          options: [
            { label: 'Nominal', value: 'nominal' },
            { label: 'Analysis', value: 'analysis' }
          ]
        },
        bindings: { value: { state: 'missionMode' } },
        events: { change: ['updateMode'] }
      },
      {
        id: 'run',
        kind: 'widget',
        type: 'button',
        props: { label: 'Run', type: 'primary' },
        bindings: { disabled: { state: 'running' } },
        events: { press: ['startRun'] }
      },
      {
        id: 'status',
        kind: 'widget',
        type: 'metric',
        props: { label: 'Status', value: 'Idle' },
        bindings: { value: { state: 'statusText' } }
      },
      {
        id: 'runs',
        kind: 'widget',
        type: 'metric',
        props: { label: 'Runs', value: 0 },
        bindings: { value: { state: 'runCount' } }
      }
    ]
  };
}

function interactions() {
  return normalizeInteractionModel({
    state: [
      { id: 'missionMode', type: 'string', initial: 'nominal' },
      { id: 'running', type: 'boolean', initial: false },
      { id: 'statusText', type: 'string', initial: 'Idle' },
      { id: 'runCount', type: 'number', initial: 0 }
    ],
    actions: [
      {
        id: 'updateMode',
        steps: [
          { type: 'set', state: 'missionMode', value: { event: 'value' } }
        ]
      },
      {
        id: 'startRun',
        steps: [
          { type: 'set', state: 'running', value: true },
          { type: 'set', state: 'statusText', value: 'Running' },
          { type: 'increment', state: 'runCount' }
        ]
      }
    ]
  });
}

test('normalizes page-local state and structured actions', () => {
  const model = interactions();
  assert.equal(model.state.length, 4);
  assert.equal(model.actions.length, 2);
  assert.deepEqual(model.actions[0].steps[0].value, { event: 'value' });
  assert.deepEqual(model.actions[1].steps[2], { type: 'increment', state: 'runCount' });
});

test('validates signal-like widget events, action slots, and state bindings', () => {
  const composition = normalizeVisualComposition(interactiveComposition());
  const result = validateCompositionInteractions(composition.root, interactions());
  assert.equal(result.bindingCount, 4);
  assert.equal(result.connectionCount, 2);
});

test('compiles bindings and actions into ordinary typed React callbacks', () => {
  const composition = normalizeVisualComposition(interactiveComposition());
  const source = renderVisualCompositionPage({ title: 'Mission', composition, interactions: interactions() });
  assert.match(source, /import \{ useState \} from 'react';/);
  assert.match(source, /const \[missionMode, setMissionMode\] = useState\("nominal"\);/);
  assert.match(source, /value=\{missionMode\}/);
  assert.match(source, /onValueChange=\{\(value\) => \{ setMissionMode\(value\); \}\}/);
  assert.match(source, /disabled=\{running\}/);
  assert.match(source, /onPress=\{\(\) => \{ setRunning\(true\); setStatusText\("Running"\); setRunCount\(\(current\) => current \+ 1\); \}\}/);
  assert.doesNotMatch(source, /eval\(|new Function|onClick:|"doSomething\(\)"/);
});

test('rejects invalid state/action typing and unsupported signal connections', () => {
  assert.throws(() => normalizeInteractionModel({
    state: [{ id: 'count', type: 'number', initial: 0 }],
    actions: [{ id: 'bad', steps: [{ type: 'set', state: 'count', value: 'not-a-number' }] }]
  }), /must be number/);

  const buttonComposition = normalizeVisualComposition({
    id: 'button', kind: 'widget', type: 'button', props: { label: 'Run' }, events: { press: ['copyValue'] }
  });
  const eventModel = normalizeInteractionModel({
    state: [{ id: 'name', type: 'string', initial: '' }],
    actions: [{ id: 'copyValue', steps: [{ type: 'set', state: 'name', value: { event: 'value' } }] }]
  });
  assert.throws(() => validateCompositionInteractions(buttonComposition.root, eventModel), /has no value/);

  assert.throws(() => normalizeVisualComposition({
    id: 'text', kind: 'widget', type: 'text', props: { text: 'x' }, events: { click: ['anything'] }
  }), /events\.click is not supported/);
});

test('rejects controlled value bindings mixed with defaultValue', () => {
  const composition = normalizeVisualComposition({
    id: 'name',
    kind: 'widget',
    type: 'input',
    props: { defaultValue: 'legacy' },
    bindings: { value: { state: 'name' } }
  });
  const model = normalizeInteractionModel({ state: [{ id: 'name', type: 'string', initial: '' }] });
  assert.throws(() => validateCompositionInteractions(composition.root, model), /cannot combine bindings\.value with props\.defaultValue/);
});
