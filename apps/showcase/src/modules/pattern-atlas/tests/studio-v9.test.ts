import { describe, expect, it, vi } from 'vitest';
import { addRecordEditorExample } from '../studio/record-template';
import { cleanStudioDocument, createStudioDocument, parseStudioFile, serializeStudioDocument, setDecoration } from '../studio/model';
import { draftFromRecord, findRecordFields, makeSavePayload, normalizeRecordField, normalizeRecordList, normalizeRecordSubmit, parseRecordRows, validRecordField, validRecordUrl } from '../studio/record-bindings';
import { exportedRecordRuntime } from '../studio/record-exporter';
import { generateReactPage, pageRecordSource, projectExportFiles } from '../studio/exporter';
import { requestStudioApi } from '../studio/api';

describe('phase 9 visual record binding', () => {
  it('keeps the Foundation Blueprint unchanged when the example page is created', () => {
    const initial = createStudioDocument();
    const before = JSON.stringify(initial.blueprint);
    const { document, pageId } = addRecordEditorExample(initial);
    expect(JSON.stringify(initial.blueprint)).toBe(before);
    expect(pageId).toBe('record-editor');
    expect(document.blueprint.pages).toHaveLength(initial.blueprint.pages.length + 1);
    expect(document.blueprint.navigation.items.some((entry) => entry.target === pageId)).toBe(true);
    expect(document.blueprint.pages.at(-1)?.composition?.type).toBe('grid');
  });
  it('creates a new identifier instead of overwriting an earlier example', () => {
    const first = addRecordEditorExample(createStudioDocument());
    const second = addRecordEditorExample(first.document);
    expect(second.pageId).toBe('record-editor-2');
    expect(second.document.blueprint.pages).toHaveLength(3);
  });
  it('round-trips new metadata without upgrading the old Studio format', () => {
    const { document, pageId } = addRecordEditorExample(createStudioDocument());
    const restored = parseStudioFile(serializeStudioDocument(document));
    expect(restored.version).toBe(1);
    expect(restored.decorations[`${pageId}:recordList`]?.recordList).toEqual({ url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title' });
    expect(restored.decorations[`${pageId}:recordTitle`]?.recordField?.field).toBe('title');
    expect(restored.decorations[`${pageId}:recordSave`]?.recordSubmit?.includeId).toBe(true);
    expect(pageRecordSource(restored, pageId)?.url).toBe('/api/studio-records');
    expect(findRecordFields(restored.blueprint.pages.at(-1)?.composition, pageId, restored.decorations)).toEqual(['title', 'status']);
  });
  it('rejects unsafe field names, URLs and malformed bindings during import', () => {
    for (const field of ['__proto__','constructor','a.b','name[0]','']) expect(validRecordField(field)).toBe(false);
    for (const url of ['javascript:alert(1)','//other.example/x','https://u:p@example.test/x','/api/ with spaces']) expect(validRecordUrl(url)).toBe(false);
    expect(normalizeRecordList({ url: 'javascript:x', itemsPath: 'data.items', idField: 'id', labelField: 'title' })).toBeUndefined();
    expect(normalizeRecordField({ field: '__proto__' })).toBeUndefined();
    expect(normalizeRecordSubmit({ url: '//bad', includeId: true })).toBeUndefined();
    const { document, pageId } = addRecordEditorExample(createStudioDocument());
    const modified = setDecoration(document, `${pageId}:recordTitle`, { recordField: { field: '__proto__' } });
    expect(cleanStudioDocument(modified).decorations[`${pageId}:recordTitle`]?.recordField).toBeUndefined();
  });
  it('keeps old projects with no record metadata valid', () => {
    const legacy = createStudioDocument();
    expect(parseStudioFile(serializeStudioDocument(legacy)).decorations).toEqual({});
  });
  it('validates arrays and protects against unbounded client-side rendering', () => {
    expect(parseRecordRows([{ id: 1, title: 'One' }, { id: '2' }, { nope: 9 }], 'id')).toHaveLength(2);
    expect(() => parseRecordRows({ items: [] }, 'id')).toThrow('不是数组');
    expect(() => parseRecordRows(Array.from({ length: 501 }, (_, id) => ({ id })), 'id')).toThrow('最多支持');
  });
  it('fills form data from the selected record and submits only bound fields', () => {
    const record = { id: 'S-101', title: 'Before', status: 'draft', serverOnly: 'not-sent' };
    const draft = draftFromRecord(record, ['title', 'status']);
    expect(draft).toEqual({ title: 'Before', status: 'draft' });
    expect(makeSavePayload({ ...draft, title: 'After' }, record, 'id', true)).toEqual({ title: 'After', status: 'draft', id: 'S-101' });
    expect(makeSavePayload(draft, record, 'id', false)).not.toHaveProperty('id');
    expect(() => makeSavePayload(draft, null, 'id', true)).toThrow('选择');
    expect(() => makeSavePayload({}, record, 'id', true)).toThrow('字段');
  });
  it('runs GET and POST via the same real request client', async () => {
    const previous = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ data: { items: [{ id: 'S-101', title: 'A' }] } }) });
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const result = await requestStudioApi({ method: 'GET', url: '/api/studio-records', responsePath: 'data.items' });
      expect(parseRecordRows(result, 'id')).toHaveLength(1);
      const body = JSON.stringify({ id: 'S-101', title: 'Updated', status: 'ready' });
      await requestStudioApi({ method: 'POST', url: '/api/studio-records', body });
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body });
    } finally { globalThis.fetch = previous; }
  });
  it('exports matching list, form, save and refresh code', () => {
    const { document, pageId } = addRecordEditorExample(createStudioDocument());
    const page = generateReactPage(document, pageId);
    const filenames = projectExportFiles(document).map((file) => file.name);
    expect(page).toContain('StudioRecordProvider');
    expect(page).toContain('StudioRecordList');
    expect(page).toContain('StudioRecordInput');
    expect(page).toContain('StudioRecordSelect');
    expect(page).toContain('StudioRecordSave');
    expect(page).toContain('"/api/studio-records"');
    expect(filenames).toContain('studio-records.tsx');
    expect(exportedRecordRuntime).toContain('setRevision((value) => value + 1)');
    expect(exportedRecordRuntime).toContain('credentials: \'same-origin\'');
  });
});
