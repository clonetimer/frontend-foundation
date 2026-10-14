/** Project-level, serializable record API connections. Only endpoint definitions are stored.
 * Never save tokens, cookies, passwords, authorization headers or executable expressions.
 */
import { validRecordField, validRecordPath, validRecordUrl, type StudioRecord, type StudioRecordListBinding, type StudioRecordSubmitBinding } from './record-bindings';
import { buildStudioListUrl, mapIncomingRecord, normalizeFieldMappings, validQueryParameter, type StudioFieldMapping } from './source-query';

export interface StudioDataSource {
  id: string;
  name: string;
  listUrl: string;
  detailUrl: string;
  saveUrl: string;
  itemsPath: string;
  detailPath: string;
  idField: string;
  labelField: string;
  pageSize: number;
  paginationMode?: 'client' | 'server';
  pageParam?: string;
  sizeParam?: string;
  searchParam?: string;
  totalPath?: string;
  fieldMappings?: StudioFieldMapping[];
  filterField?: string;
  filterParam?: string;
  filterValues?: string[];
  sortField?: string;
  sortParam?: string;
  sortDirectionParam?: string;
  createUrl?: string;
  deleteUrl?: string;
}
const validId = (id: string): boolean => /^[a-z][a-z0-9-]{0,35}$/.test(id);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function validDetailTemplate(url: string): boolean {
  if (!url) return true;
  if (url.split('{id}').length !== 2 || /[{}]/.test(url.replace('{id}', ''))) return false;
  return validRecordUrl(url.replace('{id}', 'sample-1'));
}
/** Never interpolate an unescaped identifier into a URL. */
export function detailRequestUrl(template: string, id: string): string {
  if (!validDetailTemplate(template) || !template) throw new Error('详情地址需包含一个 {id} 占位符。');
  if (!id || id.length > 120) throw new Error('选中记录的主键长度无效。');
  const url = template.replace('{id}', encodeURIComponent(id));
  if (!validRecordUrl(url)) throw new Error('详情接口 URL 无效。');
  return url;
}
export function newDemoSource(id = 'studio-records'): StudioDataSource {
  return { id, name: '演示记录', listUrl: '/api/studio-records', detailUrl: '/api/studio-records/{id}', saveUrl: '/api/studio-records', createUrl: '/api/studio-records', deleteUrl: '/api/studio-records/{id}', itemsPath: 'data.items', detailPath: 'data.item', idField: 'id', labelField: 'title', pageSize: 8, filterField: 'status', filterValues: ['ready','draft','archived'], sortField: 'title' };
}
export function newServerDemoSource(id = 'studio-mapped'): StudioDataSource {
  return { id, name: '分页与字段映射示例', listUrl: '/api/studio-records-mapped', detailUrl: '/api/studio-records-mapped/{id}', saveUrl: '/api/studio-records-mapped',
    itemsPath: 'data.entries', detailPath: 'data.entry', idField: 'id', labelField: 'title', pageSize: 2,
    createUrl: '/api/studio-records-mapped', deleteUrl: '/api/studio-records-mapped/{id}', filterField: 'status', filterParam: 'status', filterValues: ['ready','draft','archived'], sortField: 'title', sortParam: 'sortBy', sortDirectionParam: 'sortOrder',
    paginationMode: 'server', pageParam: 'page', sizeParam: 'pageSize', searchParam: 'search', totalPath: 'data.count',
    fieldMappings: [
      { field: 'id', responsePath: 'key', saveField: 'key' },
      { field: 'title', responsePath: 'subject', saveField: 'subject' },
      { field: 'status', responsePath: 'state', saveField: 'state' },
      { field: 'owner', responsePath: 'owner.name', saveField: 'owner' }
    ] };
}
export function normalizeDataSources(input: unknown): StudioDataSource[] {
  if (!Array.isArray(input)) return [];
  const result: StudioDataSource[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, 25)) {
    if (!object(raw)) continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
    const listUrl = typeof raw.listUrl === 'string' ? raw.listUrl.trim() : '';
    const detailUrl = typeof raw.detailUrl === 'string' ? raw.detailUrl.trim() : '';
    const saveUrl = typeof raw.saveUrl === 'string' ? raw.saveUrl.trim() : '';
    const itemsPath = typeof raw.itemsPath === 'string' ? raw.itemsPath.trim() : '';
    const detailPath = typeof raw.detailPath === 'string' ? raw.detailPath.trim() : '';
    const idField = typeof raw.idField === 'string' ? raw.idField.trim() : '';
    const labelField = typeof raw.labelField === 'string' ? raw.labelField.trim() : '';
    if (!validId(id) || seen.has(id)) continue;
    seen.add(id);
    // Preserve the data-source row and safe metadata during partial editing, but strip
    // invalid endpoints before they can enter a persisted document or exported code.
    result.push({ id, name: name || `未命名数据源 ${id}`, listUrl: listUrl && validRecordUrl(listUrl) ? listUrl : '',
      detailUrl: detailUrl && validDetailTemplate(detailUrl) ? detailUrl : '',
      saveUrl: saveUrl && validRecordUrl(saveUrl) ? saveUrl : '',
      itemsPath: validRecordPath(itemsPath) ? itemsPath : '',
      detailPath: validRecordPath(detailPath) ? detailPath : '',
      idField: validRecordField(idField) ? idField : 'id',
      labelField: validRecordField(labelField) ? labelField : 'title',
      pageSize: typeof raw.pageSize === 'number' && Number.isInteger(raw.pageSize) && raw.pageSize >= 1 && raw.pageSize <= 50 ? raw.pageSize : 8,
      ...(raw.paginationMode === 'server' ? { paginationMode: 'server' as const } : {}),
      ...(raw.pageParam && typeof raw.pageParam === 'string' && validQueryParameter(raw.pageParam) ? { pageParam: raw.pageParam } : {}),
      ...(raw.sizeParam && typeof raw.sizeParam === 'string' && validQueryParameter(raw.sizeParam) ? { sizeParam: raw.sizeParam } : {}),
      ...(raw.searchParam && typeof raw.searchParam === 'string' && validQueryParameter(raw.searchParam) ? { searchParam: raw.searchParam } : {}),
      ...(typeof raw.totalPath === 'string' && validRecordPath(raw.totalPath) && raw.totalPath ? { totalPath: raw.totalPath } : {}),
      ...(normalizeFieldMappings(raw.fieldMappings).length ? { fieldMappings: normalizeFieldMappings(raw.fieldMappings) } : {}),
      ...(typeof raw.filterField === 'string' && validRecordField(raw.filterField) ? { filterField: raw.filterField } : {}),
      ...(typeof raw.filterParam === 'string' && validQueryParameter(raw.filterParam) ? { filterParam: raw.filterParam } : {}),
      ...(Array.isArray(raw.filterValues) ? { filterValues: raw.filterValues.filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 60).slice(0, 15) } : {}),
      ...(typeof raw.sortField === 'string' && validRecordField(raw.sortField) ? { sortField: raw.sortField } : {}),
      ...(typeof raw.sortParam === 'string' && validQueryParameter(raw.sortParam) ? { sortParam: raw.sortParam } : {}),
      ...(typeof raw.sortDirectionParam === 'string' && validQueryParameter(raw.sortDirectionParam) ? { sortDirectionParam: raw.sortDirectionParam } : {}),
      ...(typeof raw.createUrl === 'string' && validRecordUrl(raw.createUrl) ? { createUrl: raw.createUrl } : {}),
      ...(typeof raw.deleteUrl === 'string' && validDetailTemplate(raw.deleteUrl) ? { deleteUrl: raw.deleteUrl } : {}) });
  }
  return result;
}
export function resolveRecordList(binding: StudioRecordListBinding | undefined, sources: readonly StudioDataSource[]): StudioRecordListBinding | undefined {
  if (!binding) return undefined;
  if (!binding.sourceId) return binding;
  const source = sources.find((entry) => entry.id === binding.sourceId);
  if (!source) return { ...binding, url: '' }; // never silently use a stale fallback endpoint
  return { ...binding, url: source.listUrl, itemsPath: source.itemsPath, idField: source.idField, labelField: source.labelField,
    pageSize: source.pageSize,
    ...(source.paginationMode === 'server' ? { paginationMode: 'server' as const, pageParam: source.pageParam ?? 'page', sizeParam: source.sizeParam ?? 'pageSize', searchParam: source.searchParam ?? 'search', totalPath: source.totalPath ?? 'data.total' } : {}),
    ...(source.fieldMappings?.length ? { fieldMappings: normalizeFieldMappings(source.fieldMappings) } : {}),
    ...(source.filterField ? { filterField: source.filterField } : {}),
    ...(source.filterParam ? { filterParam: source.filterParam } : {}),
    ...(source.filterValues?.length ? { filterValues: source.filterValues } : {}),
    ...(source.sortField ? { sortField: source.sortField } : {}),
    ...(source.sortParam ? { sortParam: source.sortParam } : {}),
    ...(source.sortDirectionParam ? { sortDirectionParam: source.sortDirectionParam } : {}),
    ...(source.createUrl ? { createUrl: source.createUrl } : {}),
    ...(source.deleteUrl ? { deleteUrl: source.deleteUrl } : {}),
    ...(source.detailUrl ? { detailUrl: source.detailUrl, detailPath: source.detailPath } : { detailUrl: '', detailPath: '' }) };
}
/** Resolve one project-level server data contract into a self-contained table
 *  runtime. Keep direct-URL table designs unchanged. Missing/invalid shared
 *  sources fail closed and NEVER fall back to possibly stale local endpoints.
 *  Used by both Studio live preview and the standalone page generator.
 */
export function resolveTableWidgetProps(props: Record<string, unknown>, sources: readonly StudioDataSource[]): Record<string, unknown> {
  const id = typeof props.sourceId === 'string' ? props.sourceId : '';
  if (!id) return props;
  const source = sources.find((item) => item.id === id);
  const base = { ...props, sourceId: '', sourceQueryMode: 'shared', dataUrl: '', detailUrl: '', deleteUrl: '', fieldMappings: [],
    sourceError: '关联的数据源不存在或不支持服务端分页' };
  if (!source || source.paginationMode !== 'server' || !source.listUrl || !validRecordUrl(source.listUrl)) return base;
  // Preserve the existing query-builder validation contract, including
  // duplicate parameter rejection. It is not safe to silently rename params.
  try {
    buildStudioListUrl({ ...source, url: source.listUrl }, 1);
  } catch {
    return { ...base, sourceError: '共享数据源的分页参数配置无效' };
  }
  return {
    ...base, sourceError: '', dataUrl: source.listUrl, detailUrl: source.detailUrl, detailPath: source.detailPath || 'data',
    deleteUrl: source.deleteUrl ?? '', itemsPath: source.itemsPath, totalPath: source.totalPath || 'data.total',
    idField: source.idField, pageSize: Math.min(20, source.pageSize), filterField: source.filterField ?? '',
    filterValues: source.filterValues?.join(',') ?? '', sortField: source.sortField ?? '',
    fieldMappings: normalizeFieldMappings(source.fieldMappings),
    pageParam: source.pageParam || 'page', sizeParam: source.sizeParam || 'pageSize',
    searchParam: source.searchParam || 'search', filterParam: source.filterParam || 'status',
    sortParam: source.sortParam || 'sortBy', sortDirectionParam: source.sortDirectionParam || 'sortOrder'
  };
}
export function resolveRecordSubmit(binding: StudioRecordSubmitBinding | undefined, sources: readonly StudioDataSource[]): StudioRecordSubmitBinding | undefined {
  if (!binding) return undefined;
  if (!binding.sourceId) return binding;
  const source = sources.find((entry) => entry.id === binding.sourceId);
  return { ...binding, url: source?.saveUrl ?? '', ...(source?.fieldMappings?.length ? { fieldMappings: normalizeFieldMappings(source.fieldMappings) } : {}) }; 
}
export function countDataSourceUses(sourceId: string, decorations: Record<string, { recordList?: StudioRecordListBinding | undefined; recordSubmit?: StudioRecordSubmitBinding | undefined }>): number {
  return Object.values(decorations).filter((value) => value.recordList?.sourceId === sourceId || value.recordSubmit?.sourceId === sourceId).length;
}
export function mergeRecordDetail(summary: StudioRecord, payload: unknown, idField: string, selectedId: string, mappings: readonly StudioFieldMapping[] = []): StudioRecord {
  if (!object(payload)) throw new Error('详情接口返回值需要是一个对象，请检查详情对象路径。');
  const mapped = mapIncomingRecord(payload, mappings);
  const received = mapped[idField];
  if (received !== undefined && String(received) !== selectedId) throw new Error('详情接口返回的主键与当前记录不一致。');
  const result = { ...summary };
  for (const [key, value] of Object.entries(mapped)) {
    if (validRecordField(key)) result[key] = value;
  }
  return result;
}
