import { describe, expect, it } from 'vitest';
import { defineModule } from '../src';
import { validateModules } from '../src/module/resolve-modules';

describe('module validation', () => {
  it('rejects duplicate route ids', () => {
    const modules = [defineModule({ id: 'a', routes: [{ id: 'same', path: 'a' }, { id: 'same', path: 'b' }] })];
    expect(() => validateModules(modules, {})).toThrow('Duplicate route id');
  });

  it('rejects unknown feature flags', () => {
    const modules = [defineModule({ id: 'a', featureFlag: 'missing', routes: [] })];
    expect(() => validateModules(modules, {})).toThrow('Unknown feature flag');
  });

  it('rejects application absolute paths', () => {
    const modules = [defineModule({ id: 'a', routes: [{ id: 'a.index', path: '/a' }] })];
    expect(() => validateModules(modules, {})).toThrow('must be relative');
  });

  it('rejects parameterized routes as direct navigation', () => {
    const modules = [defineModule({
      id: 'a',
      routes: [{ id: 'a.detail', path: 'a/:id', handle: { foundation: { navigation: { label: 'Detail' } } } }]
    })];
    expect(() => validateModules(modules, {})).toThrow('cannot be direct navigation');
  });
});
