import { describe, expect, it } from 'vitest';
import type { ProjectComponentRegistry } from '@foundation/design-model';
import exampleRegistry from '../../../packages/domain-widgets-fixture/foundation.registry.json';
import { createDesignerCatalog } from './catalog';
import { createNode } from './model';

describe('domain component registry integration', () => {
  it('drives palette metadata, property inspector defaults, bindings, events and container behavior', () => {
    const catalog = createDesignerCatalog(exampleRegistry as ProjectComponentRegistry);
    const overview = catalog.widgetById.get('example.interactive-viewer');
    const section = catalog.widgetById.get('example.analysis-section');

    expect(overview?.package).toBe('@example/domain-widgets');
    expect(overview?.properties?.map((entry) => entry.key)).toEqual(['itemId', 'mode', 'interactive']);
    expect(catalog.bindingProperties['example.interactive-viewer']).toEqual({ itemId: 'string', mode: 'string', interactive: 'boolean' });
    expect(catalog.widgetEvents['example.interactive-viewer']).toEqual(['focus']);
    expect(section?.acceptsChildren).toBe(true);

    const node = createNode('widget', 'example.interactive-viewer', new Set());
    expect(node.type).toBe('example.interactive-viewer');
  });
});
