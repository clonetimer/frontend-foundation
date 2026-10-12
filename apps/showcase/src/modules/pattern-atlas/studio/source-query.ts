/** Safe, declarative Studio data-source mappings and pagination. No executable expressions. */
import { readResponsePath } from './api';
import { parseRecordRows, recordText, validRecordField, validRecordPath, validRecordUrl, type StudioRecord } from './record-bindings';

export interface StudioFieldMapping { field: string; responsePath: string; saveField: string; }
export interface StudioQuerySource {
  url: string;
  itemsPath: string;
  idField: string;
  labelField: string;
  pageSize?: number;
  paginationMode?: 'client' | 'server';
  pageParam?: string;
  sizeParam?: string;
  searchParam?: string;
  totalPath?: string;
  fieldMappings?: StudioFieldMapping[];
  /** Optional business query controls; older designs omit these fields. */
  filterField?: string;
  filterParam?: string;
  filterValues?: string[];
  sortField?: string;
  sortParam?: string;
  sortDirectionParam?: string;
  createUrl?: string;
  deleteUrl?: string;
}
export interface StudioListControls { filter?: string; direction?: '' | 'asc' | 'desc' }
export const validQueryParameter = (value: string): boolean => /^[A-Za-z][\w-]{0,39}$/.test(value);
export function normalizeFieldMappings(raw: unknown): StudioFieldMapping[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: StudioFieldMapping[] = [];
  for (const row of raw.slice(0, 24)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const value = row as Record<string, unknown>;
    const field = typeof value.field === 'string' ? value.field.trim() : '';
    const responsePath = typeof value.responsePath === 'string' ? value.responsePath.trim() : '';
    const saveField = typeof value.saveField === 'string' ? value.saveField.trim() : '';
    if (!validRecordField(field) || !responsePath || !validRecordPath(responsePath) || (saveField && !validRecordField(saveField)) || seen.has(field)) continue;
    seen.add(field);
    result.push({ field, responsePath, saveField });
  }
  return result;
}
export function mapIncomingRecord(raw: unknown, mappings: readonly StudioFieldMapping[] = []): StudioRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('接口记录必须为对象。');
  const input = raw as Record<string, unknown>;
  const result: StudioRecord = {};
  for (const [field, value] of Object.entries(input)) if (validRecordField(field)) result[field] = value;
  for (const mapping of normalizeFieldMappings(mappings)) {
    const value = readResponsePath(input, mapping.responsePath);
    if (value !== undefined) result[mapping.field] = value;
  }
  return result;
}
/** Save field names may differ from response paths. Only flat, safe outgoing keys are supported. */
export function mapOutgoingPayload(payload: Record<string, string | number>, mappings: readonly StudioFieldMapping[] = []): Record<string, string | number> {
  const alias = new Map(normalizeFieldMappings(mappings).map(({ field, saveField }) => [field, saveField || field]));
  const body: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(payload)) {
    if (!validRecordField(field)) continue;
    const target = alias.get(field) ?? field;
    if (Object.prototype.hasOwnProperty.call(body, target)) throw new Error(`保存字段映射冲突：${target}`);
    body[target] = value;
  }
  return body;
}
export function buildStudioListUrl(source: StudioQuerySource, page = 1, search = '', controls: StudioListControls = {}): string {
  if (!validRecordUrl(source.url)) throw new Error('列表接口地址无效。');
  if (source.paginationMode !== 'server') return source.url;
  const names = [source.pageParam || 'page', source.sizeParam || 'pageSize', source.searchParam || 'search'];
  const optionalNames = [...(source.filterField ? [source.filterParam || 'status'] : []), ...(source.sortField ? [source.sortParam || 'sortBy', source.sortDirectionParam || 'sortOrder'] : [])];
  if ([...names, ...optionalNames].some((name) => !validQueryParameter(name)) || new Set([...names, ...optionalNames]).size !== names.length + optionalNames.length) throw new Error('分页、排序和筛选参数名须有效且不能重复。');
  if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new Error('请求页码超出范围。');
  const base = new URL(source.url, 'http://studio.local');
  base.searchParams.set(names[0]!, String(page));
  base.searchParams.set(names[1]!, String(source.pageSize ?? 8));
  const query = search.trim().slice(0, 120);
  if (query) base.searchParams.set(names[2]!, query);
  else base.searchParams.delete(names[2]!);
  if (source.filterField && controls.filter && source.filterValues?.includes(controls.filter)) base.searchParams.set(source.filterParam || 'status', controls.filter);
  else if (source.filterField) base.searchParams.delete(source.filterParam || 'status');
  if (source.sortField && ['asc', 'desc'].includes(controls.direction ?? '')) {
    base.searchParams.set(source.sortParam || 'sortBy', source.sortField);
    base.searchParams.set(source.sortDirectionParam || 'sortOrder', controls.direction!);
  } else if (source.sortField) {
    base.searchParams.delete(source.sortParam || 'sortBy');
    base.searchParams.delete(source.sortDirectionParam || 'sortOrder');
  }
  return source.url.startsWith('/') ? `${base.pathname}${base.search}${base.hash}` : base.toString();
}
export function readStudioListPayload(payload: unknown, source: StudioQuerySource): { rows: StudioRecord[]; total: number } {
  const raw = readResponsePath(payload, source.itemsPath);
  if (!Array.isArray(raw)) throw new Error('列表接口返回值不是数组，请核对记录数组路径。');
  if (raw.length > 500) throw new Error('每次最多处理 500 条列表记录，请使用服务端分页。');
  const mapped = raw.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map((item) => mapIncomingRecord(item, source.fieldMappings));
  const rows = parseRecordRows(mapped, source.idField);
  if (source.paginationMode !== 'server') return { rows, total: rows.length };
  const rawTotal = readResponsePath(payload, source.totalPath || 'data.total');
  if (typeof rawTotal !== 'number' || !Number.isSafeInteger(rawTotal) || rawTotal < 0) throw new Error('服务端分页需要有效的非负整数记录总数，请检查总数路径。');
  if (rows.length > (source.pageSize ?? 8)) throw new Error('接口本页返回记录数超过配置的每页记录数。');
  return { rows, total: rawTotal };
}
export function filterStudioRows(rows: readonly StudioRecord[], query: string, labelField: string): StudioRecord[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [...rows];
  return rows.filter((row) => recordText(row[labelField]).toLocaleLowerCase().includes(term));
}
export function applyStudioListControls(rows: readonly StudioRecord[], source: StudioQuerySource, query: string, controls: StudioListControls): StudioRecord[] {
  const filtered = filterStudioRows(rows, query, source.labelField);
  const matching = source.filterField && controls.filter && source.filterValues?.includes(controls.filter)
    ? filtered.filter((row) => String(row[source.filterField!] ?? '') === controls.filter) : filtered;
  if (!source.sortField || (controls.direction !== 'asc' && controls.direction !== 'desc')) return matching;
  const direction = controls.direction === 'asc' ? 1 : -1;
  return [...matching].sort((a, b) => recordText(a[source.sortField!]).localeCompare(recordText(b[source.sortField!]), 'zh-CN', { numeric: true }) * direction);
}
