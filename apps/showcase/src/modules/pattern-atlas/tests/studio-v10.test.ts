import { describe, expect, it } from 'vitest';
import { buildProjectBlueprint } from '../builder/project-blueprint';
import { createNode, createStudioDocument, editPageDocument, insertNode, paletteGroups, parseStudioFile, removeStudioComponent, removeStudioPage, serializeStudioDocument, setDecoration } from '../studio/model';
import { normalizeRecordField, normalizeRecordList, validateRecordDraft, findRecordRules } from '../studio/record-bindings';
import { projectExportFiles, generateReactPage, generateStudioApp } from '../studio/exporter';
import { exportedWidgetCatalog, exportedWidgetPreview } from '../studio/exported-widgets';
import { studioWidgetDefinitions, safeWidgetImageUrl } from '../studio/widgets';

const expanded = () => {
  const doc = createStudioDocument();
  const blueprint = buildProjectBlueprint({ mode: 'existing', projectId: doc.blueprint.project.id, projectTitle: doc.blueprint.project.title, pageId: 'details', pageTitle: '详细页面', template: 'blank', existingBlueprint: doc.blueprint });
  return { ...doc, blueprint };
};

describe('phase 10 designer usability and scalable widget library', () => {
  it('deletes a page, its navigation and Studio metadata without affecting other pages', () => {
    let doc = expanded();
    doc = setDecoration(doc, 'details:pageHeading', { effect: 'fade-up' });
    doc = setDecoration(doc, 'overview:taskCount', { interaction: 'navigate', targetPage: 'details' });
    const next = removeStudioPage(doc, 'details');
    expect(next.blueprint.pages.map((page) => page.id)).toEqual(['overview']);
    expect(next.blueprint.navigation.items.some((item) => item.target === 'details')).toBe(false);
    expect(next.decorations['details:pageHeading']).toBeUndefined();
    expect(next.decorations['overview:taskCount']?.targetPage).toBeUndefined();
    expect(doc.blueprint.pages).toHaveLength(2); // immutable for Undo
    expect(() => removeStudioPage(next, 'overview')).toThrow('最后一页');
  });
  it('promotes the next page to project home when the former home is removed', () => {
    const next = removeStudioPage(expanded(), 'overview');
    expect(next.blueprint.pages[0]?.id).toBe('details');
    expect(next.blueprint.pages[0]?.index).toBe(true);
    expect(next.blueprint.pages[0]?.route).toBeUndefined();
    expect(generateStudioApp(next)).toContain('"details"');
  });
  it('removes components together with all descendant Studio settings', () => {
    let doc = createStudioDocument();
    doc = setDecoration(doc, 'overview:featuredMetric', { effect: 'fade-up' });
    doc = setDecoration(doc, 'overview:featuredValue', { geometry: { width: 200 } });
    const next = removeStudioComponent(doc, 'overview', 'featuredMetric');
    expect(next.decorations['overview:featuredMetric']).toBeUndefined();
    expect(next.decorations['overview:featuredValue']).toBeUndefined();
    expect(serializeStudioDocument(next)).not.toContain('featuredValue');
    expect(doc.decorations['overview:featuredValue']).toBeDefined();
  });
  it('catalog has working Studio-backed defaults for every enhanced widget', () => {
    const kinds = new Set(paletteGroups.flatMap((group) => group.nodes.map((item) => item.type)));
    expect(kinds.size).toBe(38);
    for (const entry of studioWidgetDefinitions) {
      expect(kinds.has(entry.kind)).toBe(true);
      expect(createNode(entry.kind, 'widget1').type).toBe('placeholder');
    }
  });
  it('round-trips a real enhanced widget without changing the Foundation DSL', () => {
    let doc = createStudioDocument();
    const node = createNode('table', 'table1');
    doc = editPageDocument(doc, 'overview', (root) => insertNode(root, root.id, node));
    doc = setDecoration(doc, 'overview:table1', { widgetKind: 'table', effect: 'fade-up' });
    const restored = parseStudioFile(serializeStudioDocument(doc));
    expect(restored.decorations['overview:table1']?.widgetKind).toBe('table');
    expect(restored.blueprint.pages[0]?.composition?.children?.at(-1)?.type).toBe('placeholder');
    expect(generateReactPage(restored, 'overview')).toContain('<WidgetPreview kind={"table"}');
    expect(projectExportFiles(restored).map((item) => item.name)).toContain('widgets.ts');
  });
  it('standalone export includes the same widget implementation as the live preview', () => {
    expect(exportedWidgetPreview).toContain('export function WidgetPreview');
    expect(exportedWidgetCatalog).toContain('studioWidgetDefinitions');
    expect(projectExportFiles(createStudioDocument()).find((item) => item.name === 'studio-widget-preview.tsx')?.text).toBe(exportedWidgetPreview);
    expect(projectExportFiles(createStudioDocument()).find((item) => item.name === 'widgets.ts')?.text).toBe(exportedWidgetCatalog);
  });
  it('validates field-level rules before POST and keeps optional fields optional', () => {
    const rules = {
      title: { field: 'title', required: true, minLength: 3, maxLength: 40 },
      email: { field: 'email', format: 'email' as const },
      amount: { field: 'amount', format: 'number' as const }
    };
    expect(validateRecordDraft({ title: '', email: 'invalid', amount: 'abc' }, rules)).toMatchObject({ title: '此字段为必填项', email: '请输入有效的邮箱地址', amount: '请输入有效数字' });
    expect(validateRecordDraft({ title: 'ab', email: 'a@b.co', amount: '10' }, rules).title).toContain('至少');
    expect(validateRecordDraft({ title: 'good', email: '', amount: '' }, rules)).toEqual({});
    expect(normalizeRecordField({ field: 'title', required: true, minLength: 3, maxLength: 20, format: 'email' })).toMatchObject({ required: true, minLength: 3 });
  });
  it('supports local record pagination without claiming server-side paging', () => {
    expect(normalizeRecordList({ url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title', pageSize: 9 })?.pageSize).toBe(9);
    expect(normalizeRecordList({ url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title', pageSize: 900 })?.pageSize).toBeUndefined();
  });
  it('does not accept active script protocols as image URLs', () => {
    expect(safeWidgetImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeWidgetImageUrl('//example.com/x.svg')).toBeUndefined();
    expect(safeWidgetImageUrl('/image/logo.png')).toBe('/image/logo.png');
  });
  it('returns saved validation metadata from an existing bound input', () => {
    let doc = createStudioDocument();
    const input = createNode('input', 'input1');
    doc = editPageDocument(doc, 'overview', (root) => insertNode(root, root.id, input));
    doc = setDecoration(doc, 'overview:input1', { recordField: { field: 'title', required: true } });
    const restored = parseStudioFile(serializeStudioDocument(doc));
    expect(findRecordRules(restored.blueprint.pages[0]?.composition, 'overview', restored.decorations).title?.required).toBe(true);
    expect(generateReactPage(restored, 'overview')).toContain('"required":true');
  });
});
