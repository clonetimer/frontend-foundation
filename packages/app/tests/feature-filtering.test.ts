import { describe, expect, it } from 'vitest';
import { defineModule } from '../src';
import { resolveModules } from '../src/module/resolve-modules';

describe('feature filtering', () => {
  it('removes disabled modules before router creation', () => {
    const modules = [
      defineModule({ id: 'stable', routes: [{ id: 'stable.index', path: 'stable' }] }),
      defineModule({ id: 'preview', featureFlag: 'preview', routes: [{ id: 'preview.index', path: 'preview' }] })
    ];
    expect(resolveModules(modules, { preview: false }).map((module) => module.id)).toEqual(['stable']);
  });

  it('removes disabled child routes while keeping enabled siblings', () => {
    const modules = [defineModule({
      id: 'workspace',
      routes: [{
        id: 'workspace.root',
        path: 'workspace',
        children: [
          { id: 'workspace.stable', path: 'stable' },
          { id: 'workspace.preview', path: 'preview', handle: { foundation: { featureFlag: 'preview' } } }
        ]
      }]
    })];
    const [module] = resolveModules(modules, { preview: false });
    const root = module?.routes[0];
    expect(root && 'children' in root ? root.children?.map((route) => route.id) : []).toEqual(['workspace.stable']);
  });
});
