import { describe, expect, it } from 'vitest';
import { addSystemManagementPages, isSystemManagementPage, SYSTEM_MANAGEMENT_PAGES } from '../studio/system-management-template';
import { createStudioDocument, parseStudioFile, serializeStudioDocument } from '../studio/model';
import { generateStudioApp, projectExportFiles } from '../studio/exporter';

describe('System management starter pages', () => {
  it('installs seven consistent editable system pages without changing other pages', () => {
    const initial = createStudioDocument();
    const original = serializeStudioDocument(initial);
    const result = addSystemManagementPages(initial);
    expect(result.added).toEqual(SYSTEM_MANAGEMENT_PAGES.map((item) => item.id));
    expect(result.document.blueprint.pages.length).toBe(initial.blueprint.pages.length + 7);
    expect(result.document.blueprint.pages[0]).toEqual(initial.blueprint.pages[0]);
    expect(result.document.blueprint.navigation.items.slice(-7).map((item) => item.label)).toEqual(SYSTEM_MANAGEMENT_PAGES.map((item) => item.title));
    expect(serializeStudioDocument(initial)).toEqual(original);
    expect(result.document.dataSources).toHaveLength(7);
    expect(result.document.dataSources.every((item) => item.listUrl === '' && item.saveUrl === '' && item.deleteUrl === '')).toBe(true);
    expect(result.document.shell.navigation).toBe('sidebar');
    expect(result.document.blueprint.schemaVersion).toBe(1);
    expect(isSystemManagementPage('system-roles')).toBe(true);
    expect(isSystemManagementPage('overview')).toBe(false);
  });

  it('keeps audit and login logs read-only, while edit pages have guarded form shells', () => {
    const doc = addSystemManagementPages(createStudioDocument()).document;
    for (const spec of SYSTEM_MANAGEMENT_PAGES) {
      const root = doc.blueprint.pages.find((page) => page.id === spec.id)?.composition;
      expect(root?.children?.find((item) => item.id === 'systemTable')).toBeDefined();
      expect(doc.decorations[`${spec.id}:systemTable`]?.widgetProps?.sourceId).toBe(spec.id);
      expect(Boolean(doc.decorations[`${spec.id}:systemCreate`])).toBe(!spec.readonly);
      expect(Boolean(doc.decorations[`${spec.id}:systemEdit`])).toBe(!spec.readonly);
      if (!spec.readonly) {
        expect(doc.decorations[`${spec.id}:systemCreate`]?.widgetProps?.submitMethod).toBe('POST');
        expect(doc.decorations[`${spec.id}:systemEdit`]?.widgetProps?.submitMethod).toBe('PATCH');
        expect(doc.decorations[`${spec.id}:systemEdit`]?.widgetProps?.formMode).toBe('edit-selected');
      }
    }
  });

  it('survives Studio roundtrip and emits pages and a nested system navigation in exported standalone React', () => {
    const doc = parseStudioFile(serializeStudioDocument(addSystemManagementPages(createStudioDocument()).document));
    const exported = projectExportFiles(doc);
    expect(exported.filter((file) => file.name.startsWith('pages/system-') && file.name.endsWith('.tsx'))).toHaveLength(7);
    expect(exported.find((file) => file.name === 'StudioApp.tsx')?.text).toContain('<summary>系统管理</summary>');
    expect(exported.find((file) => file.name === 'StudioApp.tsx')?.text).toContain('systemNavIds');
    expect(exported.find((file) => file.name === 'StudioApp.tsx')?.text).not.toContain('json(shell.navigation) ===');
    expect(generateStudioApp(doc)).toContain('"system-roles"');
    expect(exported.find((file) => file.name === 'pages/system-roles.tsx')?.text).toContain('sourceError');
  });

  it('is idempotent and only fills missing pages, preserving custom data sources', () => {
    const installed = addSystemManagementPages(createStudioDocument()).document;
    const unchanged = addSystemManagementPages(installed);
    expect(unchanged.added).toEqual([]);
    expect(unchanged.document).toBe(installed);
    const partial = structuredClone(installed);
    partial.blueprint.pages = partial.blueprint.pages.filter((item) => item.id !== 'system-menus');
    partial.blueprint.navigation.items = partial.blueprint.navigation.items.filter((item) => item.target !== 'system-menus');
    partial.dataSources.find((source) => source.id === 'system-menus')!.listUrl = '/api/custom-menus';
    const fixed = addSystemManagementPages(partial);
    expect(fixed.added).toEqual(['system-menus']);
    expect(fixed.document.dataSources.find((source) => source.id === 'system-menus')?.listUrl).toBe('/api/custom-menus');
  });

  it('refuses to exceed the data source limit rather than silently truncate sources', () => {
    const original = createStudioDocument();
    original.dataSources = Array.from({length:25},(_,i)=> ({
      id:`custom-${i}`,name:`Custom ${i}`,listUrl:'',detailUrl:'',saveUrl:'',itemsPath:'data.items',
      detailPath:'data.item',idField:'id',labelField:'name',pageSize:10
    }));
    expect(() => addSystemManagementPages(original)).toThrow('上限');
    expect(original.blueprint.pages).toHaveLength(1);
  });
});
