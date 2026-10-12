/* Standalone generated runtime: kept aligned with StudioRecords and source-query. */
export const exportedRecordRuntime = String.raw`import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Input, Modal, Popconfirm, Select, message } from 'antd';
import { appendWorkflowTrace, dispatchWorkflowComponentEvent, runStudioWorkflow, type StudioWorkflow, type WorkflowTrace } from './studio-workflows';
import { WidgetPreview } from ${JSON.stringify('./studio-widget-preview')};
import type { StudioWidgetKind } from './widgets';

export interface FieldMap { field: string; responsePath: string; saveField: string }
export interface RecordSource { url: string; itemsPath: string; idField: string; labelField: string; pageSize?: number; detailUrl?: string; detailPath?: string; paginationMode?: 'client' | 'server'; pageParam?: string; sizeParam?: string; searchParam?: string; totalPath?: string; fieldMappings?: FieldMap[]; filterField?: string; filterParam?: string; filterValues?: string[]; sortField?: string; sortParam?: string; sortDirectionParam?: string; createUrl?: string; deleteUrl?: string }
export interface RecordRule { field: string; required?: boolean; minLength?: number; maxLength?: number; format?: 'email' | 'number' }
export interface RecordSubmit { url: string; includeId: boolean; fieldMappings?: FieldMap[] }
type Row = Record<string, unknown>;
interface RecordContextValue {
  source: RecordSource | null; visibleRows: Row[]; loading: boolean; error: string;
  selected: Row | null; selectedId: string; draft: Record<string, string>; errors: Record<string,string>;
  detailStatus: 'idle' | 'loading' | 'ready' | 'error'; detailError: string;
  saveStatus: 'idle' | 'loading' | 'success' | 'error'; saveError: string;
  page: number; pageSize: number; totalPages: number; totalRows: number;
  searchInput: string; setSearchInput: (value: string) => void; applySearch: () => void; retry: () => void;
  filter: string; setFilter: (value: string) => void; direction: '' | 'asc' | 'desc'; setDirection: (value: '' | 'asc' | 'desc') => void;
  create: (title: string) => Promise<void>; remove: () => Promise<void>;
  changePage: (page: number) => void; choose: (row: Row) => void; edit: (field: string, value: string) => void;
  save: (config: RecordSubmit) => Promise<void>;
}
const Context = createContext<RecordContextValue | null>(null);
const safeName = (field: string): boolean => /^[A-Za-z_$][\w$]*$/.test(field) && !['__proto__', 'prototype', 'constructor'].includes(field);
const safeParam = (name: string): boolean => /^[A-Za-z][\w-]{0,39}$/.test(name);
const validUrl = (url: string): boolean => {
  if (!url || url.length > 500 || /[\\\s]/.test(url) || url.startsWith('//')) return false;
  if (url.startsWith('/')) return true;
  try { const value = new URL(url); return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password; } catch { return false; }
};
const valueText = (value: unknown): string => value == null ? '' : typeof value === 'object' ? JSON.stringify(value).slice(0, 120) : String(value);
const idOf = (row: Row, source: RecordSource): string => String(row[source.idField] ?? '');
const pick = (input: unknown, path = ''): unknown => path ? path.split('.').reduce<unknown>((value, field) => {
  if ((!safeName(field) && !/^\d+$/.test(field)) || value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, field)) return undefined;
  return (value as Record<string, unknown>)[field];
}, input) : input;
const mapRecord = (input: unknown, mappings: FieldMap[] = []): Row => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('接口记录必须是对象');
  const mapped: Row = {};
  for (const [field, value] of Object.entries(input)) if (safeName(field)) mapped[field] = value;
  for (const entry of mappings) if (safeName(entry.field)) {
    const value = pick(input, entry.responsePath);
    if (value !== undefined) mapped[entry.field] = value;
  }
  return mapped;
};
const savePayload = (input: Record<string, string | number>, mappings: FieldMap[] = []): Record<string, string | number> => {
  const aliases = new Map(mappings.map((entry) => [entry.field, entry.saveField || entry.field]));
  const output: Record<string, string | number> = {};
  for (const [field, value] of Object.entries(input)) if (safeName(field)) {
    const target = aliases.get(field) ?? field;
    if (!safeName(target) || Object.prototype.hasOwnProperty.call(output, target)) throw new Error('保存字段映射冲突');
    output[target] = value;
  }
  return output;
};
const listUrl = (source: RecordSource, page: number, search: string, filter: string, direction: '' | 'asc' | 'desc'): string => {
  if (!validUrl(source.url)) throw new Error('列表接口地址无效');
  if (source.paginationMode !== 'server') return source.url;
  const names = [source.pageParam || 'page', source.sizeParam || 'pageSize', source.searchParam || 'search'];
  const optional = [...(source.filterField ? [source.filterParam || 'status'] : []), ...(source.sortField ? [source.sortParam || 'sortBy', source.sortDirectionParam || 'sortOrder'] : [])];
  if ([...names, ...optional].some((name) => !safeParam(name)) || new Set([...names,...optional]).size !== names.length + optional.length) throw new Error('分页/排序/筛选参数无效或重复');
  if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new Error('页码超出允许范围');
  const url = new URL(source.url, 'http://studio.local');
  url.searchParams.set(names[0]!, String(page));
  url.searchParams.set(names[1]!, String(source.pageSize ?? 8));
  if (search.trim()) url.searchParams.set(names[2]!, search.trim().slice(0, 120)); else url.searchParams.delete(names[2]!);
  if (source.filterField && source.filterValues?.includes(filter)) url.searchParams.set(source.filterParam || 'status', filter);
  else if (source.filterField) url.searchParams.delete(source.filterParam || 'status');
  if (source.sortField && (direction === 'asc' || direction === 'desc')) {
    url.searchParams.set(source.sortParam || 'sortBy', source.sortField);
    url.searchParams.set(source.sortDirectionParam || 'sortOrder', direction);
  } else if (source.sortField) {
    url.searchParams.delete(source.sortParam || 'sortBy'); url.searchParams.delete(source.sortDirectionParam || 'sortOrder');
  }
  return source.url.startsWith('/') ? url.pathname + url.search + url.hash : url.toString();
};
const clientControls = (rows: Row[], source: RecordSource, search: string, filter: string, direction: '' | 'asc' | 'desc'): Row[] => {
  const term = search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => (!term || valueText(row[source.labelField]).toLocaleLowerCase().includes(term)) && (!source.filterField || !source.filterValues?.includes(filter) || String(row[source.filterField] ?? '') === filter));
  if (!source.sortField || !direction) return filtered;
  return [...filtered].sort((a,b) => valueText(a[source.sortField!]).localeCompare(valueText(b[source.sortField!]), 'zh-CN', { numeric:true }) * (direction === 'asc' ? 1 : -1));
};
const readRows = (data: unknown, source: RecordSource): { rows: Row[]; total: number } => {
  const items = pick(data, source.itemsPath);
  if (!Array.isArray(items)) throw new Error('列表数据路径不是数组');
  if (items.length > 500) throw new Error('每次请求最多支持 500 条记录');
  const rows = items.filter((item): item is Row => Boolean(item && typeof item === 'object' && !Array.isArray(item))).map((item) => mapRecord(item, source.fieldMappings)).filter((row) => ['string', 'number'].includes(typeof row[source.idField]));
  if (source.paginationMode !== 'server') return { rows, total: rows.length };
  const total = pick(data, source.totalPath || 'data.total');
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw new Error('服务端记录总数路径无效');
  if (rows.length > (source.pageSize ?? 8)) throw new Error('本页返回的数据超过每页条数');
  return { rows, total };
};
async function request(url: string, options: RequestInit): Promise<unknown> {
  if (!validUrl(url)) throw new Error('接口地址无效');
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    let data: unknown;
    try { data = await response.json() as unknown; } catch { data = null; }
    const record = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
    const description = [record.error, record.detail, record.message, record.title].find((item): item is string => typeof item === 'string' && item.length > 0);
    const problem = new Error('HTTP ' + response.status + (description ? '：' + description.slice(0, 240) : '')) as Error & { fieldErrors?: Record<string,string> };
    if (record.errors && typeof record.errors === 'object' && !Array.isArray(record.errors)) {
      const fields: Record<string,string> = {};
      for (const [field, value] of Object.entries(record.errors).slice(0, 30)) if (safeName(field)) {
        const item = Array.isArray(value) ? value[0] : value;
        if (typeof item === 'string') fields[field] = item.slice(0, 240);
      }
      problem.fieldErrors = fields;
    }
    throw problem;
  }
  return contentType.includes('json') ? await response.json() as unknown : await response.text();
}
export function StudioRecordProvider({ source, fields, rules, children }: { source: RecordSource | null; fields: string[]; rules: Record<string, RecordRule>; children: ReactNode }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [detail, setDetail] = useState<{ id: string; row: Row } | null>(null);
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [direction, setDirection] = useState<'' | 'asc' | 'desc'>('');
  const serverPaging = source?.paginationMode === 'server';
  const pageSize = source?.pageSize ?? 8;
  useEffect(() => {
    if (!source?.url) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('atlas:records-refresh', refresh);
    return () => window.removeEventListener('atlas:records-refresh', refresh);
  }, [source?.url]);
  const signature = JSON.stringify(source ?? null);
  useEffect(() => { setPage(1); setSearch(''); setSearchInput(''); setFilter(''); setDirection(''); setSelectedId(''); }, [source?.url]);
  useEffect(() => {
    if (!source) { setRows([]); setTotalRows(0); setSelectedId(''); setError(''); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    if (serverPaging) { setRows([]); setSelectedId(''); setDetail(null); }
    let url: string;
    try { url = listUrl(source, serverPaging ? page : 1, serverPaging ? search : '', filter, direction); }
    catch (reason) { setLoading(false); setError(reason instanceof Error ? reason.message : '列表地址无效'); return; }
    void request(url, { method: 'GET', signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      const result = readRows(data, source);
      setRows(result.rows); setTotalRows(result.total);
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
      if (serverPaging && page > lastPage) { setPage(lastPage); return; }
      setSelectedId((current) => result.rows.some((row) => idOf(row, source) === current) ? current : result.rows[0] ? idOf(result.rows[0], source) : '');
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '接口读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [signature, revision, serverPaging ? page : 1, serverPaging ? search : '', serverPaging ? filter : '', serverPaging ? direction : '']);
  const filtered = useMemo(() => serverPaging ? rows : source ? clientControls(rows, source, search, filter, direction) : rows, [rows, search, serverPaging, filter, direction, signature]);
  const count = serverPaging ? totalRows : filtered.length;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = serverPaging ? rows : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const summary = visibleRows.find((row) => source && idOf(row, source) === selectedId) ?? null;
  useEffect(() => {
    setDetail(null); setDetailError('');
    if (!source?.detailUrl || !summary) { setDetailStatus('idle'); return; }
    const controller = new AbortController();
    setDetailStatus('loading');
    const template = source.detailUrl;
    if (template.split('{id}').length !== 2 || /[{}]/.test(template.replace('{id}', ''))) { setDetailStatus('error'); setDetailError('详情地址必须包含一个 {id}'); return; }
    const url = template.replace('{id}', encodeURIComponent(selectedId));
    void request(url, { method: 'GET', signal: controller.signal }).then((payload) => {
      if (controller.signal.aborted) return;
      const data = mapRecord(pick(payload, source.detailPath ?? ''), source.fieldMappings);
      if (data[source.idField] !== undefined && String(data[source.idField]) !== selectedId) throw new Error('详情记录主键不匹配');
      setDetail({ id: selectedId, row: { ...summary, ...data } }); setDetailStatus('ready');
    }).catch((reason: unknown) => { if (!controller.signal.aborted) { setDetailStatus('error'); setDetailError(reason instanceof Error ? reason.message : '读取详情失败'); } });
    return () => controller.abort();
  }, [selectedId, rows, currentPage, search, source?.detailUrl, source?.detailPath, signature, revision]);
  const selected = summary ? (detail?.id === selectedId ? detail.row : summary) : null;
  const names = fields.join('|');
  useEffect(() => { const next: Record<string, string> = {}; if (selected) for (const field of fields) if (safeName(field)) next[field] = valueText(selected[field]); setDraft(next); setErrors({}); }, [selected, names]);
  const save = async (config: RecordSubmit) => {
    if (!source || !selected) throw new Error('请先选择记录');
    if (source.detailUrl && (detailStatus !== 'ready' || detail?.id !== selectedId)) throw new Error(detailError || '请等待详情加载完成');
    if (!validUrl(config.url)) throw new Error('保存接口地址无效');
    const problems: Record<string, string> = {};
    for (const [field, rule] of Object.entries(rules)) {
      if (!safeName(field)) continue;
      const value = draft[field] ?? '';
      if (rule.required && !value.trim()) problems[field] = '此字段为必填项';
      else if (value && rule.minLength !== undefined && value.length < rule.minLength) problems[field] = '至少输入 ' + rule.minLength + ' 个字符';
      else if (value && rule.maxLength !== undefined && value.length > rule.maxLength) problems[field] = '最多输入 ' + rule.maxLength + ' 个字符';
      else if (value && rule.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) problems[field] = '请输入有效的邮箱地址';
      else if (value && rule.format === 'number' && !Number.isFinite(Number(value))) problems[field] = '请输入有效数字';
    }
    setErrors(problems);
    if (Object.keys(problems).length) throw new Error('表单未通过校验，请修正标红字段');
    const payload: Record<string, string | number> = {};
    for (const [field, value] of Object.entries(draft)) if (safeName(field) && field !== source.idField) payload[field] = value;
    if (!Object.keys(payload).length) throw new Error('请先配置表单字段');
    const id = selected[source.idField];
    if (config.includeId && (typeof id === 'string' || typeof id === 'number')) payload[source.idField] = id;
    setSaveStatus('loading'); setSaveError('');
    try {
      await request(config.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savePayload(payload, config.fieldMappings)) });
      setSaveStatus('success'); setRevision((value) => value + 1);
    } catch (reason) {
      const raw = reason as Error & { fieldErrors?: Record<string, string> };
      const reverse = new Map(config.fieldMappings?.map((entry) => [entry.saveField || entry.field, entry.field]) ?? []);
      const mapped: Record<string, string> = {};
      for (const [field, value] of Object.entries(raw.fieldErrors ?? {})) mapped[reverse.get(field) ?? field] = value;
      setErrors((old) => ({ ...old, ...mapped })); setSaveStatus('error'); setSaveError(raw.message);
      throw reason;
    }
  };
  const create = async (title: string) => {
    if (!source?.createUrl) throw new Error('未配置新增接口');
    if (title.trim().length < 2 || title.length > 120) throw new Error('标题需要 2–120 个字符');
    setSaveStatus('loading'); setSaveError('');
    try {
      await request(source.createUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body:JSON.stringify(savePayload({ title:title.trim(), status:'draft' }, source.fieldMappings)) });
      setSaveStatus('success'); setPage(1); setRevision((n) => n + 1);
    } catch (reason) { setSaveStatus('error'); setSaveError(reason instanceof Error ? reason.message : '新增失败'); throw reason; }
  };
  const remove = async () => {
    if (!source?.deleteUrl || !selectedId) throw new Error('未选中记录或未配置删除接口');
    const template = source.deleteUrl;
    if (template.split('{id}').length !== 2 || /[{}]/.test(template.replace('{id}', ''))) throw new Error('删除接口需要一个 {id}');
    const url = template.replace('{id}', encodeURIComponent(selectedId));
    setSaveStatus('loading'); setSaveError('');
    try { await request(url, { method:'DELETE' }); setSelectedId(''); setDetail(null); setSaveStatus('success'); setRevision((n) => n + 1); }
    catch (reason) { setSaveStatus('error'); setSaveError(reason instanceof Error ? reason.message : '删除失败'); throw reason; }
  };
  return <Context.Provider value={{ source, visibleRows, loading, error, selected, selectedId, draft, errors, detailStatus, detailError, saveStatus, saveError,
    page: currentPage, pageSize, totalPages, totalRows: count, searchInput, setSearchInput, applySearch: () => { setPage(1); setSelectedId(''); setSearch(searchInput.trim().slice(0, 120)); }, retry: () => setRevision((value) => value + 1),
    filter, setFilter: (value) => { setFilter(value); setPage(1); setSelectedId(''); }, direction, setDirection: (value) => { setDirection(value); setPage(1); setSelectedId(''); }, create, remove,
    changePage: (value) => { setSelectedId(''); setPage(Math.max(1, Math.min(totalPages, value))); },
    choose: (row) => { if (source) setSelectedId(idOf(row, source)); },
    edit: (field, value) => { setDraft((old) => ({ ...old, [field]: value })); setSaveStatus('idle'); setErrors((old) => { const next = { ...old }; delete next[field]; return next; }); }, save }}>{children}</Context.Provider>;
}
function useRecord(): RecordContextValue { const value = useContext<RecordContextValue | null>(Context); if (!value) throw new Error('缺少记录数据容器'); return value; }
/** Mounts overlays below the record provider, not above its context boundary. */
export function StudioRecordWidget({ kind, props }: { kind: StudioWidgetKind; props: Record<string, unknown> }) {
  const state = useRecord();
  return <WidgetPreview kind={kind} props={props} live
    recordSelection={{ selectedId: state.selectedId, selected: state.selected, detailStatus: state.detailStatus }}/>;
}

export function StudioRecordList({ title }: { title: string }) {
  const state = useRecord();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  return <div className="atlas-record-list"><strong>{title}</strong>
    <form className="atlas-record-search" onSubmit={(event) => { event.preventDefault(); state.applySearch(); }}>
      <Input size="small" aria-label="搜索记录" value={state.searchInput} placeholder="搜索记录" maxLength={120} onChange={(event) => state.setSearchInput(event.target.value)}/>
      <Button size="small" htmlType="submit">查询</Button>
      <Button size="small" onClick={state.retry} title="重新加载">↻</Button>
    </form>
    {(state.source?.filterField || state.source?.sortField || state.source?.createUrl || state.source?.deleteUrl) ? <div className="atlas-record-actions">
      {state.source?.filterField && state.source.filterValues?.length ? <Select size="small" aria-label="筛选状态" value={state.filter || '__all__'} options={[{ value:'__all__', label:'全部状态' }, ...state.source.filterValues.map((value) => ({ value, label:value }))]} onChange={(value) => state.setFilter(value === '__all__' ? '' : value)}/> : null}
      {state.source?.sortField ? <Select size="small" aria-label="排序方式" value={state.direction || 'none'} options={[{ value:'none', label:'默认顺序' }, { value:'asc', label:'升序 ↑' }, { value:'desc', label:'降序 ↓' }]} onChange={(value: 'none' | 'asc' | 'desc') => state.setDirection(value === 'none' ? '' : value)}/> : null}
      {state.source?.createUrl ? <Button type="primary" size="small" onClick={() => { setNewTitle(''); setCreateOpen(true); }}>＋新增</Button> : null}
      {state.source?.deleteUrl ? <Popconfirm title="确定删除选中记录？" description="将向后端发送 DELETE 请求，操作不可撤销。" okText="删除" cancelText="取消" okButtonProps={{danger:true}} onConfirm={() => void state.remove().then(() => message.success('删除成功')).catch((reason:unknown) => message.error(reason instanceof Error ? reason.message : '删除失败'))}><Button size="small" danger disabled={!state.selected}>删除选中</Button></Popconfirm> : null}
      <Modal title="新增记录" open={createOpen} okText="提交到后端" cancelText="取消" confirmLoading={creating} onCancel={() => setCreateOpen(false)} onOk={() => { setCreating(true); void state.create(newTitle).then(() => { setCreateOpen(false); void message.success('新增成功'); }).catch((reason:unknown) => message.error(reason instanceof Error ? reason.message : '新增失败')).finally(() => setCreating(false)); }}><label className="atlas-export-field">记录标题<Input value={newTitle} maxLength={120} onChange={(event) => setNewTitle(event.target.value)} placeholder="至少两个字符"/></label></Modal>
    </div> : null}
    {state.loading ? <div role="status">加载中…</div> : state.error ? <div role="alert" className="atlas-record-error">{state.error}<Button size="small" onClick={state.retry}>重试</Button></div> : !state.visibleRows.length ? <div>暂无记录</div> :
      <div className="atlas-record-rows">{state.visibleRows.map((row) => {
        const key = state.source ? idOf(row, state.source) : '';
        return <button type="button" key={key} className={state.selectedId === key ? 'active' : ''} aria-pressed={state.selectedId === key} onClick={() => state.choose(row)}><span>{valueText(row[state.source?.labelField ?? 'title']) || key}</span><small>{key}</small></button>;
      })}</div>}
    {state.detailStatus === 'loading' ? <div role="status">正在读取详情…</div> : null}
    {state.detailStatus === 'error' ? <div role="alert" className="atlas-record-error">{state.detailError}</div> : null}
    {state.saveStatus === 'error' ? <div role="alert" className="atlas-record-error">{state.saveError}</div> : null}
    {state.saveStatus === 'success' ? <div role="status">保存成功，列表已刷新</div> : null}
    {state.totalPages > 1 ? <div className="atlas-record-pager"><Button size="small" disabled={state.page === 1} onClick={() => state.changePage(state.page - 1)}>上一页</Button><span>{state.page} / {state.totalPages} · 共 {state.totalRows} 条</span><Button size="small" disabled={state.page >= state.totalPages} onClick={() => state.changePage(state.page + 1)}>下一页</Button></div> : null}
  </div>;
}
export function StudioRecordFieldText({ field, fallback }: { field: string; fallback: string }) { const state = useRecord(); return <>{state.selected ? (state.draft[field] ?? valueText(state.selected[field])) : fallback}</>; }
export function StudioRecordInput({ field, label, placeholder, disabled }: { field: string; label: string; placeholder: string; disabled: boolean }) {
  const state = useRecord(); return <div className="atlas-export-field"><label>{label}</label><Input aria-label={label} value={state.draft[field] ?? ''} onChange={(event) => state.edit(field, event.target.value)} placeholder={placeholder} disabled={disabled || !state.selected || state.detailStatus === 'loading' || state.detailStatus === 'error'} status={state.errors[field] ? 'error' : undefined}/>{state.errors[field] ? <small role="alert" className="atlas-record-error">{state.errors[field]}</small> : null}</div>;
}
export function StudioRecordSelect({ field, label, options, disabled }: { field: string; label: string; options: Array<{ label: string; value: string }>; disabled: boolean }) {
  const state = useRecord(); return <div className="atlas-export-field"><label>{label}</label><Select style={{ width: '100%' }} value={state.draft[field] ?? null} onChange={(value: string) => state.edit(field, value)} options={options} disabled={disabled || !state.selected || state.detailStatus === 'loading' || state.detailStatus === 'error'} status={state.errors[field] ? 'error' : undefined}/>{state.errors[field] ? <small role="alert" className="atlas-record-error">{state.errors[field]}</small> : null}</div>;
}
/** Workflow button shares the record provider with all list and form components.
 * The exported React page runs the same declarative executor as the editor. */
export function StudioWorkflowButton({ workflow, label, buttonType, disabled, binding }: {
  workflow: StudioWorkflow; label: string; buttonType: 'primary' | 'default' | 'dashed' | 'link' | 'text'; disabled: boolean; binding?: RecordSubmit;
}) {
  const state = useRecord();
  const [pending, setPending] = useState(false);
  const [traces, setTraces] = useState<WorkflowTrace[]>([]);
  const run = async () => {
    setTraces([]);
    setPending(true);
    try {
      await runStudioWorkflow(workflow, {
        confirm: (text) => window.confirm(text),
        notify: (text) => { void message.info(text || '操作完成'); },
        navigate: (pageId) => { window.location.hash = '#/' + pageId; },
        saveRecord: async () => { if (!binding) throw new Error('尚未绑定记录保存接口'); await state.save(binding); },
        refreshRecords: state.retry,
        selectedId: state.selectedId,
        draft: state.draft,
        onTrace: (entry) => setTraces((before) => appendWorkflowTrace(before, entry)),
        emit: (targetId, action) => dispatchWorkflowComponentEvent(targetId, action)
      });
    } catch (error) { void message.error(error instanceof Error ? error.message : '工作流执行失败'); }
    finally { setPending(false); }
  };
  return <div className="atlas-workflow-control"><Button type={buttonType} disabled={disabled || pending} loading={pending} onClick={() => void run()}>{label}</Button>
    {traces.length ? <details className="atlas-workflow-trace"><summary>执行记录（{traces.length}）</summary><ol>{traces.slice(-25).map((entry,index) => <li key={index}><span>{entry.stepId}</span><span>{entry.phase}</span></li>)}</ol></details> : null}
  </div>;
}
export function StudioRecordSave({ binding, label, buttonType, disabled }: { binding: RecordSubmit; label: string; buttonType: 'primary' | 'default' | 'dashed' | 'link' | 'text'; disabled: boolean }) {
  const state = useRecord(); const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!window.confirm('确定提交当前记录修改？')) return;
    setPending(true);
    try { await state.save(binding); void message.success('保存成功，列表已刷新'); }
    catch (error) { void message.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setPending(false); }
  };
  return <Button type={buttonType} loading={pending} disabled={disabled || !state.selected || pending || state.detailStatus === 'loading' || state.detailStatus === 'error'} onClick={() => void submit()}>{label}</Button>;
}
`;
