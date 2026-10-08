import { describe, expect, it } from 'vitest';
import { diagnoseBlueprintModel } from '@foundation/design-model';
import type { ProjectBlueprint, ProjectComponentRegistry } from '@foundation/design-model';

function baseBlueprint(): ProjectBlueprint {
  return {
    schemaVersion: 1,
    project: { id: 'designer.diagnostics', title: 'Designer Diagnostics' },
    foundation: {},
    pages: [{
      id: 'overview',
      title: 'Overview',
      state: [{ id: 'itemId', type: 'string', initial: 'SAT-1' }],
      actions: [],
      dataSources: [],
      operations: [],
      composition: {
        id: 'root', kind: 'layout', type: 'stack', children: [
          { id: 'viewer', kind: 'widget', type: 'example.interactive-viewer', bindings: { itemId: { state: 'itemId' } } }
        ]
      }
    }]
  };
}

const registry: ProjectComponentRegistry = {
  schemaVersion: 1,
  widgets: [{
    id: 'example.interactive-viewer',
    package: '@example/domain-widgets',
    version: '^2.0.0',
    exportName: 'InteractiveViewer',
    description: 'Interactive viewer',
    properties: [{ key: 'itemId', label: 'Item', kind: 'text', required: true }],
    bindings: { itemId: 'string' }
  }]
};

describe('browser-safe project diagnostics', () => {
  it('accepts required custom properties satisfied by bindings', () => {
    expect(diagnoseBlueprintModel(baseBlueprint(), registry)).toEqual([]);
  });

  it('reports composition, interaction and data-operation failures with stable categories', () => {
    const blueprint = baseBlueprint();
    const page = blueprint.pages[0]!;
    page.composition!.children![0]!.bindings = { itemId: { state: 'missing' } };
    page.actions = [{ id: 'run', steps: [{ type: 'invoke', operation: 'missingOperation' }] }];
    page.operations = [{ id: 'badOperation', source: 'missingSource' }];
    const diagnostics = diagnoseBlueprintModel(blueprint, registry);
    expect(diagnostics.some((entry) => entry.code === 'INTERACTION_INVALID' && entry.nodeId === 'viewer')).toBe(true);
    expect(diagnostics.some((entry) => entry.code === 'DATA_OPERATION_INVALID' && entry.message.includes('missingOperation'))).toBe(true);
    expect(diagnostics.some((entry) => entry.code === 'DATA_OPERATION_INVALID' && entry.message.includes('missingSource'))).toBe(true);
  });
});
