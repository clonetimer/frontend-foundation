import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVisualComposition, renderVisualCompositionPage } from '../visual-composition.mjs';

function composition() {
  return {
    id: 'root',
    kind: 'layout',
    type: 'stack',
    props: { direction: 'vertical', gap: 16 },
    children: [
      { id: 'heading', kind: 'widget', type: 'text', props: { text: 'Mission Control', variant: 'title' } },
      {
        id: 'metrics',
        kind: 'layout',
        type: 'grid',
        props: { columns: 3, gap: 12 },
        children: [
          { id: 'active', kind: 'widget', type: 'metric', props: { label: 'Active', value: 3 } },
          { id: 'queued', kind: 'widget', type: 'metric', props: { label: 'Queued', value: 1 } },
          { id: 'health', kind: 'widget', type: 'metric', props: { label: 'Health', value: 'Nominal' } }
        ]
      },
      {
        id: 'workbench',
        kind: 'layout',
        type: 'split',
        props: { secondarySize: 320 },
        children: [
          { id: 'viewer', kind: 'widget', type: 'placeholder', props: { title: 'Orbit viewer' } },
          {
            id: 'inspector',
            kind: 'widget',
            type: 'panel',
            props: { title: 'Inspector' },
            children: [
              { id: 'name', kind: 'widget', type: 'input', props: { label: 'Mission name', placeholder: 'Name' } },
              { id: 'run', kind: 'widget', type: 'button', props: { label: 'Run', type: 'primary' } }
            ]
          }
        ]
      }
    ]
  };
}

test('normalizes a recursive visual composition tree with stable node identities', () => {
  const normalized = normalizeVisualComposition(composition());
  assert.equal(normalized.nodeCount, 11);
  assert.equal(normalized.root.type, 'stack');
  assert.equal(normalized.root.children[2].type, 'split');
  assert.equal(normalized.root.children[2].children[1].children[1].id, 'run');
});

test('renders visual composition into ordinary TSX source rather than runtime JSON interpretation', () => {
  const normalized = normalizeVisualComposition(composition());
  const source = renderVisualCompositionPage({ title: 'Mission Console', composition: normalized });
  assert.match(source, /StackLayout/);
  assert.match(source, /GridLayout/);
  assert.match(source, /SplitLayout/);
  assert.match(source, /MetricWidget/);
  assert.match(source, /InputWidget/);
  assert.match(source, /foundation-node:viewer/);
  assert.doesNotMatch(source, /JSON\.parse|VisualRenderer|RuntimeSchema/);
});

test('supports tab containers with explicit child labels', () => {
  const normalized = normalizeVisualComposition({
    id: 'tabs', kind: 'layout', type: 'tabs', children: [
      { id: 'summary', label: 'Summary', kind: 'widget', type: 'text', props: { text: 'Summary' } },
      { id: 'logs', label: 'Logs', kind: 'widget', type: 'placeholder', props: { title: 'Logs' } }
    ]
  });
  const source = renderVisualCompositionPage({ title: 'Tabs', composition: normalized });
  assert.match(source, /TabsLayout/);
  assert.match(source, /label: "Summary"/);
  assert.match(source, /label: "Logs"/);
});

test('rejects ambiguous or unsafe visual composition structures', () => {
  assert.throws(() => normalizeVisualComposition({
    id: 'split', kind: 'layout', type: 'split', children: [
      { id: 'only', kind: 'widget', type: 'text', props: { text: 'Only' } }
    ]
  }), /requires exactly 2 children/);

  assert.throws(() => normalizeVisualComposition({
    id: 'tabs', kind: 'layout', type: 'tabs', children: [
      { id: 'missing-label', kind: 'widget', type: 'text', props: { text: 'No label' } }
    ]
  }), /label is required/);

  assert.throws(() => normalizeVisualComposition({
    id: 'root', kind: 'layout', type: 'stack', children: [
      { id: 'same', kind: 'widget', type: 'text', props: { text: 'A' } },
      { id: 'same', kind: 'widget', type: 'text', props: { text: 'B' } }
    ]
  }), /Duplicate visual composition node id/);

  assert.throws(() => normalizeVisualComposition({
    id: 'bad', kind: 'widget', type: 'button', props: { label: 'Go', onClick: 'doSomething()' }
  }), /onClick is not supported/);
});
