import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addSystemManagementPages, addSystemManagementActions } from '../studio/system-management-template';
import { createStudioDocument, parseStudioFile, serializeStudioDocument } from '../studio/model';
import { projectExportFiles } from '../studio/exporter';
import { parseManagementAssignment, parseManagementNodes, resolveManagementUrl } from '../studio/system-management-actions';
import { exportedSystemManagementActions } from '../studio/exported-system-management-actions';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';
import { normalizeWidgetProps } from '../studio/widgets';

describe('system-management privileged interactions', () => {
  it('accepts exact safe endpoint templates, rejects unsafe methods and invalid templates', () => {
    expect(resolveManagementUrl('/api/roles/{id}/users', 'r/1 ?', true)).toBe('/api/roles/r%2F1%20%3F/users');
    expect(resolveManagementUrl('/api/menus')).toBe('/api/menus');
    expect(resolveManagementUrl('javascript:alert(1)')).toBeNull();
    expect(resolveManagementUrl('//example.test/path')).toBeNull();
    expect(resolveManagementUrl('/api/x/{id}/{id}', 'x', true)).toBeNull();
    expect(resolveManagementUrl('/api/roles/{id}', '', true)).toBeNull();
    expect(resolveManagementUrl('/api/roles', 'r1', true)).toBeNull();
    expect(resolveManagementUrl('https://user:password@api.test/x')).toBeNull();
  });
  it('validates tree depth, item count, duplicate ID and malformed children', () => {
    expect(parseManagementNodes({data:{items:[{id:'root',name:'根菜单',children:[{id:'child',name:'子菜单'}]}]}})[0]?.children?.[0]?.id).toBe('child');
    expect(() => parseManagementNodes({data:{items:[{id:'a',name:'A'},{id:'a',name:'B'}]}})).toThrow('重复');
    expect(() => parseManagementNodes({data:{items:[{id:'x',name:'X',children:[{id:'x',name:'cycle'}]}]}})).toThrow('重复');
    expect(() => parseManagementNodes({data:{items:Array.from({length:201}, (_,i)=>({id:String(i),name:String(i)}))}})).toThrow('过多');
    expect(() => parseManagementNodes({data:{items:[{id:'a',name:'A',children:'bad'}]}})).toThrow('children');
  });
  it('requires a strong snapshot ETag for complete role memberships', () => {
    expect(parseManagementAssignment({data:{ids:['u1','u2'],etag:'"rev-9"'}})).toEqual({ids:['u1','u2'],etag:'"rev-9"'});
    expect(() => parseManagementAssignment({data:{ids:['u1'],etag:'W/"rev-9"'}})).toThrow('强 ETag');
    expect(() => parseManagementAssignment({data:{ids:['u1','u1'],etag:'"rev-9"'}})).toThrow('重复');
    expect(() => parseManagementAssignment({data:{ids:[{}],etag:'"rev-9"'}})).toThrow('ID');
  });
  it('installs role, menu, user, dictionary actions with blank endpoints and no audit writes', () => {
    const doc = addSystemManagementPages(createStudioDocument()).document;
    const expectations: Record<string,string[]> = {
      'system-roles': ['systemRoleUsers','systemRolePermissions','systemRoleStatus'],
      'system-menus': ['systemMenuTree','systemMenuStatus'],
      'system-users': ['systemUserStatus'],
      'system-dictionaries': ['systemDictionaryStatus']
    };
    for (const [pageId, ids] of Object.entries(expectations)) {
      const page = doc.blueprint.pages.find((item) => item.id === pageId)!;
      for (const id of ids) {
        expect(page.composition?.children?.some((item) => item.id === id)).toBe(true);
        expect(doc.decorations[pageId+':'+id]?.widgetKind).toBe('management-actions');
        const props = doc.decorations[pageId+':'+id]?.widgetProps;
        expect(props?.optionsUrl === '' || String(props?.optionsUrl).startsWith('/api/system/')).toBe(true);
        expect(props?.submitUrl === '' || String(props?.submitUrl).startsWith('/api/system/')).toBe(true);
      }
    }
    expect(doc.decorations['system-operation-logs:systemRoleUsers']).toBeUndefined();
    expect(doc.decorations['system-login-logs:systemMenuTree']).toBeUndefined();
    expect(normalizeWidgetProps('management-actions', { actionMode: 'status' }).actionMode).toBe('status');
  });
  it('adds only missing actions for existing system pages, preserving configured sources', () => {
    const installed = addSystemManagementPages(createStudioDocument()).document;
    const original = structuredClone(installed);
    const ids = ['systemRoleUsers','systemRolePermissions','systemRoleStatus','systemMenuTree','systemMenuStatus','systemUserStatus','systemDictionaryStatus'];
    for (const key of Object.keys(original.decorations)) if (original.decorations[key]?.widgetKind === 'management-actions') delete original.decorations[key];
    for (const page of original.blueprint.pages) if (page.id.startsWith('system-')) page.composition!.children = page.composition!.children!.filter((child) => !ids.includes(child.id));
    original.dataSources.find((item) => item.id === 'system-roles')!.listUrl = '/api/custom';
    const result = addSystemManagementActions(original);
    expect(result.added).toHaveLength(7);
    expect(result.document.dataSources.find((item) => item.id === 'system-roles')?.listUrl).toBe('/api/custom');
    expect(addSystemManagementActions(result.document).added).toEqual([]);
    const roundtrip = parseStudioFile(serializeStudioDocument(result.document));
    expect(roundtrip.decorations['system-roles:systemRoleUsers']?.widgetProps?.actionMode).toBe('role-users');
  });
  it('exports source parity, available action props, and self-contained React pages', () => {
    const doc = parseStudioFile(serializeStudioDocument(addSystemManagementPages(createStudioDocument()).document));
    const files = projectExportFiles(doc);
    expect(files.find((f) => f.name === 'system-management-actions.tsx')?.text).toBe(exportedSystemManagementActions);
    expect(files.find((f) => f.name === 'studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(files.find((f) => f.name === 'widgets.ts')?.text).toBe(exportedWidgetCatalog);
    expect(exportedSystemManagementActions).toBe(readFileSync(new URL('../studio/system-management-actions.tsx', import.meta.url), 'utf8'));
    expect(files.find((f) => f.name === 'pages/system-roles.tsx')?.text).toContain('role-users');
    expect(files.find((f) => f.name === 'pages/system-menus.tsx')?.text).toContain('menu-tree');
  });
});
