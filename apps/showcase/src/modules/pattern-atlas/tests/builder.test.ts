import { describe, expect, it } from 'vitest';
import { buildProjectBlueprint, parseExistingBlueprint, serializeBlueprint } from '../builder/project-blueprint';

const base = { mode: 'new' as const, projectId: 'operations.app', projectTitle: '项目工作台', pageId: 'overview', pageTitle: '总览页面' };

describe('Pattern Atlas: a real Project Blueprint authoring flow', () => {
  it.each(['blank', 'bento', 'master-detail'] as const)('creates a compiler-compatible %s project layout', (template) => {
    const project = buildProjectBlueprint({ ...base, template, primaryColor: '#11765c' });
    expect(project.schemaVersion).toBe(1);
    expect(project.project.id).toBe('operations.app');
    expect(project.project.packageName).toBe('operations-app');
    expect(project.pages[0]?.index).toBe(true);
    expect(project.pages[0]?.composition?.kind).toBe('layout');
    expect(project.navigation.items[0]?.target).toBe('overview');
    expect(parseExistingBlueprint(serializeBlueprint(project)).project.title).toBe('项目工作台');
  });

  it('does not rewrite an existing project, its page state, or the caller object', () => {
    const original = buildProjectBlueprint({ ...base, template: 'blank' });
    Object.assign(original.pages[0]!, { state: [{ id: 'count', type: 'number', initial: 1 }] });
    const snapshot = serializeBlueprint(original);
    const updated = buildProjectBlueprint({ ...base, mode: 'existing', template: 'master-detail', pageId: 'orders', pageTitle: '订单页面', existingBlueprint: original });
    expect(updated.pages).toHaveLength(2);
    expect(updated.pages[0]).toEqual(original.pages[0]);
    expect(updated.pages[1]?.route).toBe('orders');
    expect(updated.navigation.items.map((item) => item.target)).toEqual(['overview', 'orders']);
    expect(serializeBlueprint(original)).toBe(snapshot);
  });

  it('rejects existing route collisions and wrong JSON format', () => {
    const original = buildProjectBlueprint({ ...base, template: 'bento' });
    expect(() => buildProjectBlueprint({ ...base, mode: 'existing', template: 'blank', existingBlueprint: original })).toThrow(/已存在页面/);
    expect(() => parseExistingBlueprint('{"schemaVersion":2,"pages":[]}')).toThrow(/Blueprint v1/);
    expect(() => parseExistingBlueprint('not json')).toThrow(/JSON/);
  });

  it('rejects invalid generated IDs', () => {
    expect(() => buildProjectBlueprint({ ...base, pageId: '中文页面', template: 'blank' })).toThrow(/页面标识/);
    expect(() => buildProjectBlueprint({ ...base, projectId: 'Bad Project', template: 'blank' })).toThrow(/项目标识/);
  });
});
