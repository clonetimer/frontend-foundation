import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompositionNode } from '../bridge';
import { requestStudioApi, StudioRequestError } from './api';
import { classifyMutationException, parseMutationFieldErrors } from './widgets';
import { findRecordFields, findRecordRules, validateRecordDraft, makeSavePayload, recordId, recordText, type StudioRecord, type StudioRecordListBinding, type StudioRecordSubmitBinding } from './record-bindings';
import { walkNodes, type StudioDecoration } from './model';
import { detailRequestUrl, mergeRecordDetail, resolveRecordList, resolveRecordSubmit, type StudioDataSource } from './data-sources';
import { applyStudioListControls, buildStudioListUrl, mapOutgoingPayload, readStudioListPayload } from './source-query';

export interface StudioRecordFlow {
  status: 'idle' | 'loading' | 'ready' | 'error';
  detailStatus: 'idle' | 'loading' | 'ready' | 'error';
  detailError: string;
  saveStatus: 'idle' | 'loading' | 'success' | 'error';
  saveError: string;
  idField: string; labelField: string; sourceUrl: string;
  error: string;
  rows: StudioRecord[]; visibleRows: StudioRecord[];
  selected: StudioRecord | null; draft: Record<string, string>; selectedId: string;
  saving: boolean; errors: Record<string, string>;
  page: number; pageSize: number; totalPages: number; totalRows: number; serverPaging: boolean;
  searchInput: string; setSearchInput: (value: string) => void; applySearch: () => void;
  filter: string; setFilter: (value: string) => void;
  direction: '' | 'asc' | 'desc'; setDirection: (value: '' | 'asc' | 'desc') => void;
  filterOptions: string[]; sortField: string; canCreate: boolean; canDelete: boolean;
  create: (title: string) => Promise<void>; remove: () => Promise<void>;
  retry: () => void; changePage: (page: number) => void;
  select: (row: StudioRecord) => void; edit: (field: string, value: string) => void;
  save: (config: StudioRecordSubmitBinding) => Promise<void>;
}
function findList(root: CompositionNode | undefined, decorations: Record<string, StudioDecoration>, pageId: string): StudioRecordListBinding | undefined {
  let found: StudioRecordListBinding | undefined;
  walkNodes(root, (node) => { if (!found && node.type === 'placeholder') found = (decorations[`${pageId}:${node.id}`] ?? decorations[node.id])?.recordList; });
  return found;
}
export function useStudioRecordFlow(root: CompositionNode | undefined, decorations: Record<string, StudioDecoration>, pageId: string, live: boolean, dataSources: readonly StudioDataSource[] = []): StudioRecordFlow {
  const source = useMemo(() => resolveRecordList(findList(root, decorations, pageId), dataSources), [root, decorations, pageId, dataSources]);
  const signature = JSON.stringify(source ?? null);
  const fields = useMemo(() => findRecordFields(root, pageId, decorations), [root, decorations, pageId]);
  const rules = useMemo(() => findRecordRules(root, pageId, decorations), [root, pageId, decorations]);
  const [rows, setRows] = useState<StudioRecord[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [detail, setDetail] = useState<{ id: string; value: StudioRecord } | null>(null);
  const [detailStatus, setDetailStatus] = useState<StudioRecordFlow['detailStatus']>('idle');
  const [detailError, setDetailError] = useState('');
  const [status, setStatus] = useState<StudioRecordFlow['status']>('idle');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<StudioRecordFlow['saveStatus']>('idle');
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const writeLock = useRef(false);
  const [writing, setWriting] = useState(false);
  const announceMutation = () => window.dispatchEvent(new Event('atlas:records-refresh'));
  // Synchronous mutual exclusion: a rapid double click cannot issue two writes.
  const exclusiveWrite = async (operation: () => Promise<void>): Promise<void> => {
    if (writeLock.current) throw new Error('已有写入请求正在执行，请勿重复提交');
    writeLock.current = true; setWriting(true);
    try { await operation(); }
    finally { writeLock.current = false; setWriting(false); }
  };
  const retainedDraft = useRef<{ id: string; values: Record<string,string> } | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [direction, setDirection] = useState<'' | 'asc' | 'desc'>('');
  const serverPaging = source?.paginationMode === 'server';
  const pageSize = source?.pageSize ?? 8;
  useEffect(() => {
    if (!live || !source?.url) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('atlas:records-refresh', refresh);
    return () => window.removeEventListener('atlas:records-refresh', refresh);
  }, [live, source?.url]);
  // Switching to another page or endpoint starts a fresh query, without retaining the prior record.
  useEffect(() => { setPage(1); setSearch(''); setSearchInput(''); setFilter(''); setDirection(''); setSelectedId(''); setSaveStatus('idle'); }, [pageId, source?.url]);
  useEffect(() => {
    if (!live || !source?.url) { setRows([]); setTotalRows(0); setStatus('idle'); setSelectedId(''); setDraft({}); setErrors({}); return; }
    const controller = new AbortController();
    setStatus('loading'); setError('');
    // A refresh must preserve the active edit target. Page/filter/source changes
    // clear selection explicitly; clearing it here silently switches records.
    try {
      const url = buildStudioListUrl(source, serverPaging ? page : 1, serverPaging ? search : '', { filter, direction });
      void requestStudioApi({ method: 'GET', url }, controller.signal).then((payload) => {
        if (controller.signal.aborted) return;
        const result = readStudioListPayload(payload, source);
        setRows(result.rows); setTotalRows(result.total);
        if (serverPaging && page > Math.max(1, Math.ceil(result.total / pageSize))) {
          setPage(Math.max(1, Math.ceil(result.total / pageSize)));
          return;
        }
        setSelectedId((previous) => previous
          ? (result.rows.some((row) => recordId(row, source.idField) === previous) ? previous : '')
          : (result.rows[0] ? recordId(result.rows[0], source.idField) : ''));
        setStatus('ready');
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : '列表读取失败'); setStatus('error'); }
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '接口配置无效'); setStatus('error'); }
    return () => controller.abort();
  }, [live, pageId, signature, revision, serverPaging ? page : 1, serverPaging ? search : '', serverPaging ? filter : '', serverPaging ? direction : '']);
  const filteredRows = useMemo(() => serverPaging ? rows : source ? applyStudioListControls(rows, source, search, { filter, direction }) : rows, [rows, search, serverPaging, signature, filter, direction]);
  const filteredTotal = serverPaging ? totalRows : filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => serverPaging ? rows : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [serverPaging, rows, filteredRows, currentPage, pageSize]);
  const summary = visibleRows.find((row) => recordId(row, source?.idField ?? 'id') === selectedId) ?? null;
  // Cancel the previous detail request whenever selection or page data changes.
  useEffect(() => {
    setDetail(null); setDetailError('');
    if (!live || !summary || !source?.detailUrl) { setDetailStatus('idle'); return; }
    const controller = new AbortController();
    setDetailStatus('loading');
    let url: string;
    try { url = detailRequestUrl(source.detailUrl, selectedId); }
    catch (reason) { setDetailError(reason instanceof Error ? reason.message : '详情地址错误'); setDetailStatus('error'); return; }
    void requestStudioApi({ method: 'GET', url, ...(source.detailPath ? { responsePath: source.detailPath } : {}) }, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        try { setDetail({ id: selectedId, value: mergeRecordDetail(summary, payload, source.idField, selectedId, source.fieldMappings) }); setDetailStatus('ready'); }
        catch (reason) { setDetailError(reason instanceof Error ? reason.message : '详情字段映射错误'); setDetailStatus('error'); }
      }).catch((reason: unknown) => { if (!controller.signal.aborted) { setDetailError(reason instanceof Error ? reason.message : '详情读取失败'); setDetailStatus('error'); } });
    return () => controller.abort();
  }, [live, selectedId, source?.detailUrl, source?.detailPath, source?.idField, signature, revision, rows, currentPage, search]);
  const selected = useMemo(() => summary ? (detail?.id === selectedId ? detail.value : summary) : null, [summary, detail, selectedId]);
  const keys = fields.join('|');
  useEffect(() => {
    const next: Record<string, string> = {};
    if (selected) for (const field of fields) next[field] = recordText(selected[field]);
    if (retainedDraft.current?.id === selectedId && selected) Object.assign(next, retainedDraft.current.values);
    retainedDraft.current = null;
    setDraft(next); setErrors({});
  }, [selected, keys]);
  const performSave = async (config: StudioRecordSubmitBinding) => {
    if (!source) throw new Error('请在本页面先配置记录列表。');
    if (source.detailUrl && (detailStatus !== 'ready' || detail?.id !== selectedId)) throw new Error(detailError || '请等待详情加载完成。');
    const problems = validateRecordDraft(draft, rules);
    setErrors(problems);
    if (Object.keys(problems).length) throw new Error('请先修正红色提示的表单字段。');
    const payload = makeSavePayload(draft, selected, source.idField, config.includeId);
    const actual = resolveRecordSubmit(config, dataSources);
    if (!actual?.url) throw new Error('保存接口尚未配置。');
    setSaveStatus('loading'); setSaveError('');
    try {
      await requestStudioApi({ method: 'POST', url: actual.url, body: JSON.stringify(mapOutgoingPayload(payload, actual.fieldMappings)) });
      setSaveStatus('success'); announceMutation();
    } catch (reason) {
      const failure = classifyMutationException(reason);
      if (reason instanceof StudioRequestError && failure.kind === 'invalid') {
        const parsed = parseMutationFieldErrors({ errors: reason.fieldErrors }, actual.fieldMappings);
        const allowed = new Set(fields);
        const visible = Object.fromEntries(Object.entries(parsed).filter(([field]) => allowed.has(field)));
        if (Object.keys(visible).length) setErrors((previous) => ({ ...previous, ...visible }));
      }
      if (failure.refresh) {
        retainedDraft.current = { id: selectedId, values: { ...draft } };
        announceMutation();
      }
      setSaveStatus('error');
      setSaveError(failure.kind === 'uncertain' ? '写入结果不确定：' + failure.message : failure.message);
      throw new Error(failure.kind === 'uncertain' ? '写入结果不确定：' + failure.message : failure.message, { cause: reason });
    }
  };
  const performCreate = async (title: string) => {
    if (!source?.createUrl) throw new Error('请先在数据源中配置新增 POST 接口。');
    if (title.trim().length < 2 || title.length > 120) throw new Error('标题需要 2–120 个字符。');
    setSaveStatus('loading'); setSaveError('');
    try {
      const payload = mapOutgoingPayload({ title: title.trim(), status: 'draft' }, source.fieldMappings);
      await requestStudioApi({ method: 'POST', url: source.createUrl, body: JSON.stringify(payload) });
      setSaveStatus('success'); setPage(1); announceMutation();
    } catch (reason) {
      const failure = classifyMutationException(reason);
      if (failure.refresh) announceMutation();
      setSaveStatus('error');
      setSaveError(failure.kind === 'uncertain' ? '写入结果不确定：' + failure.message : failure.message);
      throw new Error(failure.kind === 'uncertain' ? '写入结果不确定：' + failure.message : failure.message, { cause: reason });
    }
  };
  const performRemove = async () => {
    if (!source?.deleteUrl || !selectedId) throw new Error('请先选中记录，并配置删除 DELETE 接口。');
    const url = detailRequestUrl(source.deleteUrl, selectedId);
    setSaveStatus('loading'); setSaveError('');
    try {
      await requestStudioApi({ method: 'DELETE', url });
      setSelectedId(''); setDetail(null); setSaveStatus('success'); announceMutation();
    } catch (reason) {
      const failure = classifyMutationException(reason);
      if (failure.refresh) announceMutation();
      setSaveStatus('error');
      setSaveError(failure.kind === 'uncertain' ? '删除结果不确定：' + failure.message : failure.message);
      throw new Error(failure.kind === 'uncertain' ? '删除结果不确定：' + failure.message : failure.message, { cause: reason });
    }
  };
  const save = (config: StudioRecordSubmitBinding): Promise<void> => exclusiveWrite(() => performSave(config));
  const create = (title: string): Promise<void> => exclusiveWrite(() => performCreate(title));
  const remove = (): Promise<void> => exclusiveWrite(performRemove);
  const applySearch = () => { setPage(1); setSelectedId(''); setSearch(searchInput.trim().slice(0, 120)); setSaveStatus('idle'); };
  return { status, detailStatus, detailError, saveStatus, saveError, idField: source?.idField ?? 'id', labelField: source?.labelField ?? 'title', sourceUrl: source?.url ?? '', rows, visibleRows, selected, selectedId, error, draft, saving: writing, errors,
    page: currentPage, pageSize, totalPages, totalRows: filteredTotal, serverPaging, searchInput, setSearchInput, applySearch, retry: () => setRevision((old) => old + 1),
    filter, setFilter: (value) => { setFilter(value); setPage(1); setSelectedId(''); },
    direction, setDirection: (value) => { setDirection(value); setPage(1); setSelectedId(''); },
    filterOptions: source?.filterValues ?? [], sortField: source?.sortField ?? '', canCreate: Boolean(source?.createUrl), canDelete: Boolean(source?.deleteUrl), create, remove,
    changePage: (next) => { setSelectedId(''); setPage(Math.max(1, Math.min(totalPages, next))); setSaveStatus('idle'); },
    select: (row) => { setSelectedId(recordId(row, source?.idField ?? 'id')); setSaveStatus('idle'); },
    edit: (field, value) => { setDraft((old) => ({ ...old, [field]: value })); setSaveStatus('idle'); setErrors((old) => { const next = { ...old }; delete next[field]; return next; }); }, save };
}
