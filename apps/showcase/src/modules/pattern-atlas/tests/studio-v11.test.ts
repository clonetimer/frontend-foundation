import { describe, expect, it, vi } from 'vitest';
import { addLinkedRecordExample } from '../studio/record-template';
import { countDataSourceUses, detailRequestUrl, mergeRecordDetail, newDemoSource, normalizeDataSources, resolveRecordList, resolveRecordSubmit, validDetailTemplate } from '../studio/data-sources';
import { createStudioDocument, parseStudioFile, serializeStudioDocument, setDecoration } from '../studio/model';
import { generateReactPage, pageRecordSource, projectExportFiles } from '../studio/exporter';
import { requestStudioApi } from '../studio/api';
import { exportedRecordRuntime } from '../studio/record-exporter';

describe('phase 11 project data sources and three-step record flow', () => {
  it('imports older phase 10 v1 Studio files without requiring a data-source registry', () => {
    const legacy = JSON.parse(serializeStudioDocument(createStudioDocument())) as Record<string, unknown>;
    delete legacy.dataSources;
    const restored = parseStudioFile(JSON.stringify(legacy));
    expect(restored.dataSources).toEqual([]);
    expect(restored.version).toBe(1);
  });
  it('round-trips project data sources as Studio-only metadata', () => {
    const { document } = addLinkedRecordExample(createStudioDocument());
    const originalBlueprint = JSON.stringify(document.blueprint);
    const restored = parseStudioFile(serializeStudioDocument(document));
    expect(restored.dataSources[0]?.detailUrl).toBe('/api/studio-records/{id}');
    expect(JSON.stringify(restored.blueprint)).toEqual(originalBlueprint);
    expect(restored.decorations['record-editor:recordList']?.recordList?.sourceId).toBe('studio-records');
    expect(restored.decorations['record-editor:recordSave']?.recordSubmit?.sourceId).toBe('studio-records');
  });
  it('rejects untrusted registry identifiers, unsafe endpoint values and duplicate source IDs', () => {
    const demo = newDemoSource();
    const sources = normalizeDataSources([demo, demo, { ...demo, id: '__proto__' }, { ...demo, id: 'bad', detailUrl: 'javascript:alert(1)' }, { ...demo, id: 'bad2', listUrl: '//evil.invalid/records' }]);
    expect(sources.map((source) => source.id)).toEqual(['studio-records', 'bad', 'bad2']);
    expect(sources.find((item) => item.id === 'bad')?.detailUrl).toBe('');
    expect(sources.find((item) => item.id === 'bad2')?.listUrl).toBe('');
  });
  it('interpolates encoded IDs only into a single safe detail placeholder', () => {
    expect(detailRequestUrl('/api/studio-records/{id}', 'R/42 ?')).toBe('/api/studio-records/R%2F42%20%3F');
    expect(validDetailTemplate('/api/{id}/{id}')).toBe(false);
    expect(validDetailTemplate('/api/{user}')).toBe(false);
    expect(() => detailRequestUrl('/api/{id}/{id}', 'A')).toThrow();
    expect(() => detailRequestUrl('javascript:{id}', 'A')).toThrow();
  });
  it('keeps detail data isolated to its selected record and strips dangerous keys', () => {
    expect(mergeRecordDetail({ id: 'A', title: 'A' }, { id: 'A', owner: 'Alice' }, 'id', 'A')).toMatchObject({ owner: 'Alice' });
    expect(() => mergeRecordDetail({ id: 'A' }, { id: 'B' }, 'id', 'A')).toThrow('主键');
    expect(() => mergeRecordDetail({ id: 'A' }, ['invalid'], 'id', 'A')).toThrow('对象');
    const payload = JSON.parse('{"id":"A","__proto__":{"polluted":true},"owner":"Bob"}') as unknown;
    expect(Object.prototype.hasOwnProperty.call(mergeRecordDetail({ id: 'A' }, payload, 'id', 'A'), '__proto__')).toBe(false);
  });
  it('resolves shared source endpoints for list and save, without silently using obsolete URLs', () => {
    const list = { sourceId: 'studio-records', url: '/fallback', itemsPath: '', idField: 'id', labelField: 'name' };
    const save = { sourceId: 'studio-records', url: '/fallback-save', includeId: true };
    expect(resolveRecordList(list, [newDemoSource()])).toMatchObject({ url: '/api/studio-records', detailUrl: '/api/studio-records/{id}', itemsPath: 'data.items' });
    expect(resolveRecordSubmit(save, [newDemoSource()])?.url).toBe('/api/studio-records');
    expect(resolveRecordList(list, [])?.url).toBe('');
    expect(resolveRecordSubmit(save, [])?.url).toBe('');
    expect(resolveRecordList({ url: '/old', itemsPath: '', idField: 'id', labelField: 'name' }, [])?.url).toBe('/old');
  });
  it('tracks references so the editor can refuse deletion of an in-use source', () => {
    const { document, pageId } = addLinkedRecordExample(createStudioDocument());
    expect(countDataSourceUses('studio-records', document.decorations)).toBe(2);
    const unbound = setDecoration(document, `${pageId}:recordList`, { recordList: { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title' } });
    expect(countDataSourceUses('studio-records', unbound.decorations)).toBe(1);
  });
  it('adds a detail-only field which is not supplied by the list API', () => {
    const { document, pageId } = addLinkedRecordExample(createStudioDocument());
    expect(document.decorations[`${pageId}:recordOwner`]?.recordField?.field).toBe('owner');
    expect(document.blueprint.pages.find((entry) => entry.id === pageId)?.composition?.children?.[1]?.children?.some((node) => node.id === 'recordOwner')).toBe(true);
  });
  it('exports resolved GET detail and POST endpoints while keeping the registry editable', () => {
    const { document, pageId } = addLinkedRecordExample(createStudioDocument());
    const page = generateReactPage(document, pageId);
    const project = projectExportFiles(document);
    expect(pageRecordSource(document, pageId)?.detailUrl).toBe('/api/studio-records/{id}');
    expect(page).toContain('"detailUrl":"/api/studio-records/{id}"');
    expect(page).toContain('"url":"/api/studio-records"');
    expect(exportedRecordRuntime).toContain('encodeURIComponent(selectedId)');
    expect(exportedRecordRuntime).toContain('setRevision((value) => value + 1)');
    expect(project.find((item) => item.name === 'atlas.studio.json')?.text).toContain('"dataSources"');
  });
  it('follows GET list → GET detail → validated POST → GET refresh with a mocked API', async () => {
    const { validateRecordDraft, makeSavePayload } = await import('../studio/record-bindings');
    const requests: Array<{ method: string; url: string; body?: string }> = [];
    let title = '初始记录';
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      requests.push({ method, url: String(url), ...(init?.body ? { body: String(init.body) } : {}) });
      if (method === 'POST') {
        title = String((JSON.parse(String(init?.body)) as { title: string }).title);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const detail = String(url).includes('/S-101');
      const data = detail ? { data: { item: { id: 'S-101', title, owner: 'Alice' } } } : { data: { items: [{ id: 'S-101', title }] } };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    try {
      const rows = await requestStudioApi({ method: 'GET', url: '/api/studio-records', responsePath: 'data.items' }) as Array<{ id:string; title:string }>;
      const detail = await requestStudioApi({ method: 'GET', url: detailRequestUrl('/api/studio-records/{id}', rows[0]!.id), responsePath: 'data.item' });
      const selected = mergeRecordDetail(rows[0]!, detail, 'id', 'S-101');
      const draft = { title: '已修改的记录', owner: String(selected.owner) };
      expect(validateRecordDraft(draft, { title: { field: 'title', required: true, minLength: 2 } })).toEqual({});
      await requestStudioApi({ method: 'POST', url: '/api/studio-records', body: JSON.stringify(makeSavePayload(draft, selected, 'id', true)) });
      const refreshed = await requestStudioApi({ method: 'GET', url: '/api/studio-records', responsePath: 'data.items' }) as Array<{ title:string }>;
      expect(refreshed[0]?.title).toBe('已修改的记录');
      expect(requests.map((request) => request.method)).toEqual(['GET', 'GET', 'POST', 'GET']);
      expect(requests[2]?.body).toContain('Alice');
    } finally { globalThis.fetch = previous; }
  });
  it('uses the existing GET request client to fetch list and details, without sending POST in a test', async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ data: { items: [{ id: 'S-101', title: 'A' }] } }) })
      .mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ data: { item: { id: 'S-101', title: 'A', owner: 'Alice' } } }) });
    const previous = globalThis.fetch;
    globalThis.fetch = mock as typeof fetch;
    try {
      const list = await requestStudioApi({ method: 'GET', url: '/api/studio-records', responsePath: 'data.items' }) as Array<{id:string}>;
      const detail = await requestStudioApi({ method: 'GET', url: detailRequestUrl('/api/studio-records/{id}', list[0]!.id), responsePath: 'data.item' });
      expect(mergeRecordDetail(list[0]!, detail, 'id', list[0]!.id).owner).toBe('Alice');
      expect(mock.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'GET']);
    } finally { globalThis.fetch = previous; }
  });
});
