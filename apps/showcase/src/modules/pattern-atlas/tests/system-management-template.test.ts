import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { exportedManagementDb, exportedManagementServer } from '../studio/exported-management-service';
import { exportedManagementAuth } from '../studio/exported-management-auth';
import { exportedManagementLaunch, exportedManagementMaintenance } from '../studio/exported-management-operations';
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
    expect(result.document.dataSources.every((item) => item.listUrl.startsWith('/api/system/'))).toBe(true);
    expect(result.document.dataSources.filter((item) => item.id.includes('logs')).every((item) => !item.saveUrl && !item.deleteUrl)).toBe(true);
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
    expect(exported.some((file) => file.name === 'management/server.py')).toBe(true);
    expect(exported.some((file) => file.name === 'management/db.py')).toBe(true);
    expect(exported.some((file) => file.name === 'management-auth.tsx')).toBe(true);
    expect(exported.some((file) => file.name === 'vite.config.ts')).toBe(true);
  });

  it('ships exactly the source-tested Python service and session/password management UI', () => {
    const backend = readFileSync(new URL('../../../../../../services/management/server.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const database = readFileSync(new URL('../../../../../../services/management/db.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(exportedManagementServer).toBe(backend);
    expect(exportedManagementDb).toBe(database);
    expect(exportedManagementAuth).toContain('/api/system/auth/change-password');
    const doc = addSystemManagementPages(createStudioDocument()).document;
    const entries = projectExportFiles(doc);
    expect(entries.find((entry) => entry.name === 'management/server.py')?.text).toBe(backend);
    expect(entries.find((entry) => entry.name === 'management/db.py')?.text).toBe(database);
    expect(entries.find((entry) => entry.name === 'management-auth.tsx')?.text).toBe(exportedManagementAuth);
  });

  it('exports a synchronized one-command local app, recoverable database and page-level permissions', () => {
    const doc = addSystemManagementPages(createStudioDocument()).document;
    const files = projectExportFiles(doc);
    const read = (name: string) => files.find((entry) => entry.name === name)?.text;
    const normalized = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(exportedManagementMaintenance).toBe(normalized('../../../../../../services/management/maintenance.py'));
    expect(exportedManagementLaunch).toBe(normalized('../../../../../../services/management/launch.py'));
    expect(read('management/maintenance.py')).toBe(exportedManagementMaintenance);
    expect(read('management/launch.py')).toBe(exportedManagementLaunch);
    expect(read('start.bat')).toContain('management\\launch.py');
    expect(read('start.sh')).toContain('python3 management/launch.py');
    expect(JSON.parse(read('management/page-permissions.json') ?? '{}')).toEqual({
      pages:[{id:'overview',title:'项目概览'}]
    });
    expect(read('StudioApp.tsx')).toContain('page:overview:view');
    expect(read('StudioApp.tsx')).toContain('managementEnabled = true');
    expect(read('StudioApp.tsx')).toContain('onPermissions={setGrants}');
    expect(exportedManagementAuth).toContain('requiredPermission');
    expect(exportedManagementAuth).toContain('无权访问此页面');
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
