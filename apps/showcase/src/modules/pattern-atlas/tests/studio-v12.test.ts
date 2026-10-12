import { describe, expect, it, vi } from 'vitest';
import { createStudioDocument, parseStudioFile, serializeStudioDocument } from '../studio/model';
import { addLinkedRecordExample } from '../studio/record-template';
import { newServerDemoSource, normalizeDataSources, resolveRecordList, resolveRecordSubmit, mergeRecordDetail } from '../studio/data-sources';
import { buildStudioListUrl, filterStudioRows, mapIncomingRecord, mapOutgoingPayload, normalizeFieldMappings, readStudioListPayload } from '../studio/source-query';
import { requestStudioApi } from '../studio/api';
import { generateReactPage, projectExportFiles } from '../studio/exporter';
import { exportedRecordRuntime } from '../studio/record-exporter';

const serverSource = newServerDemoSource();
const source = { ...serverSource, url: serverSource.listUrl };
const page1 = { data: { entries: [{ key: 'S-101', subject: '整理项目需求', state: 'ready' }, { key: 'S-102', subject: '配置数据接口', state: 'draft' }], count: 3 } };

describe('phase 12 server paging, declarative mapping and request states', () => {
  it('keeps old clients on the unchanged endpoint and local paging', () => {
    const legacy = normalizeDataSources([{ ...source, paginationMode: undefined, fieldMappings: undefined }])[0]!;
    expect(buildStudioListUrl({ ...legacy, url: '/api/records?tag=1' }, 2, '查询')).toBe('/api/records?tag=1');
    expect(legacy.paginationMode).toBeUndefined();
    expect(legacy.fieldMappings).toBeUndefined();
  });
  it('encodes page, size and search while preserving existing safe query parameters', () => {
    expect(buildStudioListUrl({ ...source, url: '/api/studio-records-mapped?category=A' }, 2, 'A&B')).toBe('/api/studio-records-mapped?category=A&page=2&pageSize=2&search=A%26B');
    expect(buildStudioListUrl(source, 1, '')).toBe('/api/studio-records-mapped?page=1&pageSize=2');
  });
  it('does not permit duplicate or unsafe query parameter names', () => {
    expect(() => buildStudioListUrl({ ...source, searchParam: 'page' }, 1, 'foo')).toThrow();
    expect(() => buildStudioListUrl({ ...source, pageParam: '__proto__{}' }, 1, '')).toThrow();
    expect(() => buildStudioListUrl(source, 0, '')).toThrow();
  });
  it('maps nested response paths onto editable fields, keeping identifiers stable', () => {
    expect(readStudioListPayload(page1, source)).toEqual({ rows: [{ key: 'S-101', subject: '整理项目需求', state: 'ready', id: 'S-101', title: '整理项目需求', status: 'ready' }, { key: 'S-102', subject: '配置数据接口', state: 'draft', id: 'S-102', title: '配置数据接口', status: 'draft' }], total: 3 });
    const detail = { key: 'S-101', subject: '整理项目需求', state: 'ready', owner: { name: '产品团队' } };
    expect(mergeRecordDetail({ id: 'S-101', title: '整理项目需求' }, detail, 'id', 'S-101', source.fieldMappings).owner).toBe('产品团队');
    expect(() => mergeRecordDetail({ id: 'S-101' }, { key: 'S-999' }, 'id', 'S-101', source.fieldMappings)).toThrow('主键');
  });
  it('rejects invalid server totals, overfull pages and invalid list paths', () => {
    expect(() => readStudioListPayload({ data: { entries: page1.data.entries } }, source)).toThrow('总数');
    expect(() => readStudioListPayload({ data: { entries: [...page1.data.entries, { key: 'S-103', subject: '额外', state: 'ready' }], count: 3 } }, source)).toThrow('每页');
    expect(() => readStudioListPayload({ data: { entries: {} , count: 4 } }, source)).toThrow('数组');
  });
  it('sanitizes malformed and prototype-mutating mappings without executing paths', () => {
    const input = [source.fieldMappings![0], source.fieldMappings![0], { field: 'owner', responsePath: 'owner.name', saveField: 'owner' }, { field: '__proto__', responsePath: 'foo' }, { field: 'bad', responsePath: 'constructor.prototype' }];
    expect(normalizeFieldMappings(input).map((entry) => entry.field)).toEqual(['id', 'owner']);
    expect(mapIncomingRecord(JSON.parse('{"__proto__":{"polluted":true},"title":"ok"}'), [])).toEqual({ title: 'ok' });
  });
  it('remaps safe outgoing keys, and rejects multiple fields mapped to one key', () => {
    expect(mapOutgoingPayload({ id: 'S-101', title: '新版', status: 'draft', owner: 'Alice' }, source.fieldMappings)).toEqual({ key: 'S-101', subject: '新版', state: 'draft', owner: 'Alice' });
    expect(() => mapOutgoingPayload({ title: 'A', status: 'ready' }, [{ field: 'title', responsePath: 'a', saveField: 'value' }, { field: 'status', responsePath: 'b', saveField: 'value' }])).toThrow('冲突');
  });
  it('preserves client-side filtering for old data-source pages', () => {
    expect(filterStudioRows([{ title: 'Alpha' }, { title: 'Beta' }], 'alp', 'title')).toEqual([{ title: 'Alpha' }]);
  });
  it('persists new registry fields without modifying the Foundation Blueprint', () => {
    const initial = addLinkedRecordExample(createStudioDocument()).document;
    const updated = { ...initial, dataSources: [newServerDemoSource('studio-records')] };
    const blueprint = JSON.stringify(updated.blueprint);
    const result = parseStudioFile(serializeStudioDocument(updated));
    expect(result.dataSources[0]?.paginationMode).toBe('server');
    expect(result.dataSources[0]?.fieldMappings?.length).toBe(4);
    expect(JSON.stringify(result.blueprint)).toBe(blueprint);
    expect(resolveRecordList(result.decorations['record-editor:recordList']?.recordList, result.dataSources)?.totalPath).toBe('data.count');
    expect(resolveRecordSubmit(result.decorations['record-editor:recordSave']?.recordSubmit, result.dataSources)?.fieldMappings?.[1]?.saveField).toBe('subject');
  });
  it('exports the mapping, remote-page settings and editable project file together', () => {
    const initial = addLinkedRecordExample(createStudioDocument()).document;
    const updated = { ...initial, dataSources: [newServerDemoSource('studio-records')] };
    const page = generateReactPage(updated, 'record-editor');
    expect(page).toContain('"paginationMode":"server"');
    expect(page).toContain('"totalPath":"data.count"');
    expect(page).toContain('"saveField":"subject"');
    expect(exportedRecordRuntime).toContain('mapRecord(');
    expect(exportedRecordRuntime).toContain('url.searchParams.set');
    expect(projectExportFiles(updated).some((item) => item.name === 'atlas.studio.json')).toBe(true);
  });
  it('translates HTTP 422 field errors into a typed, bounded failure', async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: '校验失败', errors: { subject: ['标题过短'] } }) }) as typeof fetch;
    try {
      await expect(requestStudioApi({ method: 'POST', url: '/api/studio-records-mapped', body: '{}' })).rejects.toMatchObject({ status: 422, fieldErrors: { subject: '标题过短' } });
    } finally { globalThis.fetch = previous; }
  });
  it('exercises actual GET page 2 / search / detail / mapped POST / refresh requests', async () => {
    const previous = globalThis.fetch;
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    let title = '整理项目需求';
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input), method = init?.method ?? 'GET';
      requests.push({ url, method, ...(init?.body ? { body: String(init.body) } : {}) });
      const query = new URL(url, 'http://local');
      const data = method === 'POST' ? { success: true } : url.endsWith('/S-101') ? { data: { entry: { key: 'S-101', subject: title, state: 'ready', owner: { name: 'Alice' } } } } :
        { data: { entries: query.searchParams.get('page') === '2' ? [{ key: 'S-103', subject: '验收', state: 'ready' }] : [{ key: 'S-101', subject: title, state: 'ready' }], count: 3 } };
      if (method === 'POST') title = JSON.parse(String(init?.body)).subject as string;
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => data } as unknown as Response;
    }) as typeof fetch;
    try {
      const query2 = buildStudioListUrl(source, 2, 'api');
      expect(readStudioListPayload(await requestStudioApi({ method: 'GET', url: query2 }), source).rows[0]?.id).toBe('S-103');
      const query1 = buildStudioListUrl(source, 1, '');
      const rows = readStudioListPayload(await requestStudioApi({ method: 'GET', url: query1 }), source).rows;
      const detail = await requestStudioApi({ method: 'GET', url: '/api/studio-records-mapped/S-101', responsePath: 'data.entry' });
      const selected = mergeRecordDetail(rows[0]!, detail, 'id', 'S-101', source.fieldMappings);
      expect(selected.owner).toBe('Alice');
      await requestStudioApi({ method: 'POST', url: source.saveUrl, body: JSON.stringify(mapOutgoingPayload({ id: 'S-101', title: '调整项目需求', status: 'ready' }, source.fieldMappings)) });
      expect(readStudioListPayload(await requestStudioApi({ method: 'GET', url: query1 }), source).rows[0]?.title).toBe('调整项目需求');
      expect(requests.map((entry) => entry.method)).toEqual(['GET', 'GET', 'GET', 'POST', 'GET']);
      expect(requests[3]?.body).toContain('"subject":"调整项目需求"');
    } finally { globalThis.fetch = previous; }
  });
});
