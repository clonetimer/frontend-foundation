import { describe, expect, it, vi } from 'vitest';
import { createStudioDocument, normalizeGeometry, parseStudioFile, serializeStudioDocument, setDecoration } from '../studio/model';
import { newDemoSource, newServerDemoSource, normalizeDataSources, detailRequestUrl } from '../studio/data-sources';
import { applyStudioListControls, buildStudioListUrl, mapOutgoingPayload } from '../studio/source-query';
import { projectExportFiles, generateReactPage } from '../studio/exporter';
import { requestStudioApi } from '../studio/api';

const server = newServerDemoSource();
const querySource = { ...server, url: server.listUrl };

describe('Phase 13: positions, business filters and API workflows', () => {
  it('preserves legacy X/Y offsets and keeps absolute coordinates explicit', () => {
    expect(normalizeGeometry({ x: -12, y: 48 })).toEqual({ x: -12, y: 48 });
    expect(normalizeGeometry({ mode: 'absolute', x: 0, y: 35, width: 300 })).toEqual({ mode: 'absolute', x: 0, y: 35, width: 300 });
    expect(normalizeGeometry({ mode: 'absolute', x: -100 })).toEqual({ mode: 'absolute' });
    const initial = createStudioDocument();
    const updated = setDecoration(initial, `${initial.blueprint.pages[0]!.id}:taskCount`, { geometry: { mode: 'absolute', x: 25, y: 100, width: 200 } });
    const restored = parseStudioFile(serializeStudioDocument(updated));
    expect(restored.decorations[`${initial.blueprint.pages[0]!.id}:taskCount`]?.geometry?.mode).toBe('absolute');
  });
  it('keeps optional business endpoints out of old designs', () => {
    const old = { ...newDemoSource(), createUrl: undefined, deleteUrl: undefined, sortField: undefined, filterField: undefined };
    const restored = normalizeDataSources([old])[0]!;
    expect(restored.createUrl).toBeUndefined();
    expect(restored.deleteUrl).toBeUndefined();
    expect(normalizeDataSources([{ ...server, deleteUrl: '/delete/me' }])[0]?.deleteUrl).toBeUndefined();
    expect(normalizeDataSources([server])[0]?.filterValues).toEqual(['ready', 'draft', 'archived']);
  });
  it('generates a safe encoded server query for filter, sort, paging and search', () => {
    const url = buildStudioListUrl(querySource, 2, 'a&b', { filter: 'ready', direction: 'desc' });
    expect(url).toBe('/api/studio-records-mapped?page=2&pageSize=2&search=a%26b&status=ready&sortBy=title&sortOrder=desc');
    expect(buildStudioListUrl(querySource, 1, '', { filter: 'invalid', direction: '' })).toBe('/api/studio-records-mapped?page=1&pageSize=2');
    expect(() => buildStudioListUrl({ ...querySource, filterParam: 'page' }, 1)).toThrow();
    expect(buildStudioListUrl({ ...querySource, paginationMode: 'client' }, 3, 'hello', { filter: 'draft' })).toBe('/api/studio-records-mapped');
  });
  it('sorts client rows without mutating the source and filters by configured status', () => {
    const rows = [{ id: '2', title: '任务10', status: 'ready' }, { id: '3', title: '任务2', status: 'draft' }, { id: '1', title: '任务1', status: 'ready' }];
    expect(applyStudioListControls(rows, querySource, '任务', { filter: 'ready', direction: 'asc' }).map((row) => row.id)).toEqual(['1', '2']);
    expect(rows[0]?.id).toBe('2');
    expect(applyStudioListControls(rows, querySource, '', { filter: '', direction: 'desc' }).map((row) => row.id)).toEqual(['2', '3', '1']);
  });
  it('encodes the selected primary key before inserting into DELETE URLs', () => {
    expect(detailRequestUrl('/api/studio-records/{id}', 'S/1 ?')).toBe('/api/studio-records/S%2F1%20%3F');
    expect(() => detailRequestUrl('/api/studio-records/{id}/{id}', '1')).toThrow();
  });
  it('retains workflow settings in exported Studio and standalone React', () => {
    const initial = createStudioDocument();
    const document = { ...initial, dataSources: [server] };
    const files = projectExportFiles(document);
    expect(files.find((file) => file.name === 'atlas.studio.json')?.text).toContain('"deleteUrl"');
    expect(files.find((file) => file.name === 'studio-records.tsx')?.text).toContain('method:\'DELETE\'');
    const page = generateReactPage(document, document.blueprint.pages[0]!.id);
    expect(page).toContain('StudioRecordProvider');
  });
  it('executes the browser GET, POST-create, DELETE, GET-refresh sequence without URL credentials', async () => {
    const previous = globalThis.fetch;
    const methods: string[] = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return new Response(JSON.stringify({ success: true, data: { items: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      await requestStudioApi({ method: 'GET', url: server.listUrl });
      await requestStudioApi({ method: 'POST', url: server.createUrl!, body: JSON.stringify(mapOutgoingPayload({ title: '新任务', status: 'draft' }, server.fieldMappings)) });
      await requestStudioApi({ method: 'DELETE', url: detailRequestUrl(server.deleteUrl!, 'S-101') });
      await requestStudioApi({ method: 'GET', url: server.listUrl });
      expect(methods).toEqual(['GET', 'POST', 'DELETE', 'GET']);
    } finally { globalThis.fetch = previous; }
  });
});
