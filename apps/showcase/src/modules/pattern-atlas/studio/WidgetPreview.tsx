import { useEffect, useId, useRef, useState } from 'react';
import type { InputRef } from 'antd';
import { Alert, Avatar, Breadcrumb, Checkbox, Collapse, DatePicker, Descriptions, Divider, Empty, Input, InputNumber, Progress, Radio, Rate, Modal, Skeleton, Slider, Space, Spin, Statistic, Steps, Switch, Table, Tag, Timeline, Button, Drawer, Popconfirm, message } from 'antd';
import { safeWidgetImageUrl, widgetItems, widgetValues, parseChartSeries, parseRemoteChartDataset, parseOverlayFormFields, validateOverlayForm, mapOverlaySubmitPayload, classifyMutationHttpFailure, classifyMutationTransportFailure, parseMutationFieldErrors, type MutationFailure, overlaySubmitUrl, parseRemoteTableColumns, parseRemoteTablePage, strongRecordEtag, type RemoteTableRow, type RemoteTablePage, type OverlayRecordSelection, type ChartDataset, type ChartSeries, type StudioWidgetKind } from './widgets';
import { normalizeStudioWorkflow, runStudioWorkflow, dispatchWorkflowComponentEvent, type StudioWorkflow } from './studio-workflows';
import { SystemManagementAction } from './system-management-actions';

const label = (value: unknown, defaultValue = ''): string => typeof value === 'string' || typeof value === 'number' ? String(value) : defaultValue;
const rows = (value: unknown) => widgetItems(value).map((item, index) => { const [name, status = '—'] = item.split('|'); return { key: index, name, status }; });
function apiUrl(value: unknown): string | undefined { const url = safeWidgetImageUrl(value); return url && url !== '/' ? url : undefined; }
function pathValue(data: unknown, path: string): unknown {
  if (!path || !path.split('.').every((part) => /^(?:[a-zA-Z_$][\w$]*|\d+)$/.test(part) && !['__proto__', 'constructor', 'prototype'].includes(part))) return undefined;
  return path.split('.').reduce<unknown>((obj, key) => obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[key] : undefined, data);
}
function confirmUpload(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({ title: '确认上传', content: `向配置的后端上传「${name}」？`, onOk: () => { resolve(true); }, onCancel: () => { resolve(false); } });
  });
}
function FileUploadWidget({ props, live }: { props: Record<string, unknown>; live: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const limit = Math.max(1, Math.min(30, Number(props.maxSizeMb) || 5));
  const url = apiUrl(props.uploadUrl);
  const accept = label(props.accept, '.pdf,.png,.jpg');
  const send = async () => {
    if (!file || !url || !live) return;
    if (!(await confirmUpload(file.name))) return;
    const body = new FormData(); body.append('file', file);
    setBusy(true); setStatus('上传中…');
    try {
      const result = await fetch(url, { method: 'POST', body, credentials: 'same-origin' });
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      setStatus(url === '/api/studio-upload-demo' ? '演示接口已接收（不保存文件）' : '上传成功');
    } catch (error) { setStatus(error instanceof Error ? `上传失败：${error.message}` : '上传失败'); }
    finally { setBusy(false); }
  };
  return <div className="pa-studio-rich pa-studio-file"><strong>{label(props.title, '上传附件')}</strong>
    <input type="file" disabled={!live || busy} accept={accept} aria-label="选择文件" onChange={(event) => {
      const next = event.target.files?.[0] ?? null;
      if (next && next.size > limit * 1024 * 1024) { setFile(null); setStatus(`文件大小不能超过 ${limit} MB`); }
      else { setFile(next); setStatus(next ? `已选：${next.name}（${Math.ceil(next.size / 1024)} KB）` : ''); }
    }}/>
    <div className="pa-studio-widget-actions"><small>允许 {accept} · ≤{limit}MB</small>{url ? <Button size="small" type="primary" disabled={!live || !file} loading={busy} onClick={() => void send()}>上传</Button> : <small>未连接上传接口，仅本地选取</small>}</div>
    {status ? <small role="status">{status}</small> : null}
  </div>;
}
function AsyncTaskWidget({ props, live }: { props: Record<string, unknown>; live: boolean }) {
  const [status, setStatus] = useState('等待查询');
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const session = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = apiUrl(props.statusUrl);
  const pause = () => { session.current?.abort(); session.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null; setRunning(false); };
  useEffect(() => { if (!live) pause(); return () => { session.current?.abort(); if (timer.current) clearTimeout(timer.current); }; }, [live, url]);
  const begin = () => {
    if (!live || !url) return;
    pause(); setStatus('查询中…'); setProgress(0); setRunning(true);
    const controller = new AbortController(); session.current = controller;
    const interval = Math.max(1500, Math.min(30000, Number(props.pollMs) || 3000));
    const step = async (count: number): Promise<void> => {
      try {
        const res = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (controller.signal.aborted) return;
        const value = label(pathValue(data, label(props.statusPath, 'data.status')), 'unknown').toLowerCase();
        const percent = Number(pathValue(data, label(props.percentPath, 'data.progress')));
        setProgress(Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0);
        setStatus(value);
        if (['success', 'completed', 'done', 'failed', 'error', 'cancelled'].includes(value)) { setRunning(false); return; }
        if (count >= 19) { setRunning(false); setStatus('已达到 20 次查询上限'); return; }
        timer.current = setTimeout(() => { void step(count + 1); }, interval);
      } catch (error) { if (!controller.signal.aborted) { setStatus(error instanceof Error ? error.message : '查询失败'); setRunning(false); } }
    };
    void step(0);
  };
  return <div className="pa-studio-rich pa-studio-task"><strong>{label(props.title, '任务进度')}</strong>
    <div className="pa-studio-widget-actions"><Tag>{status}</Tag><span>{progress}%</span></div>
    <Progress percent={progress} size="small"/>
    {url ? <Button size="small" disabled={!live} onClick={() => running ? pause() : begin()}>{running ? '停止查询' : '查询任务状态'}</Button> : <small>设置状态 GET 地址后，可在体验模式查询后台任务</small>}
  </div>;
}

/** Signed number axis, multiple series, legend and native SVG point tooltips. */
function LineWidget({ items, series, title, unit }: { items: string[]; series: ChartSeries[]; title: string; unit: string }) {
  const colors = ['#168765', '#5277d2', '#d4773d', '#a261b5', '#be5365', '#4d9fa0'];
  const all = series.flatMap((entry) => entry.values);
  if (!all.length) return <div className="pa-studio-rich"><strong>{title}</strong><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无曲线数据"/></div>;
  const low = Math.min(...all), high = Math.max(...all);
  const margin = (high - low || Math.max(1, Math.abs(high) * .2)) * .1;
  const minimum = low - margin, maximum = high + margin;
  const count = Math.max(...series.map((entry) => entry.values.length));
  const x = (index: number) => 52 + 316 * index / Math.max(1, count - 1);
  const y = (value: number) => 18 + (maximum - value) / (maximum - minimum) * 144;
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4);
  const fmt = (value: number) => Number(value.toPrecision(5)).toLocaleString();
  const xIndices = Array.from({ length: Math.min(count, 7) }, (_, i) => Math.round(i * (count - 1) / Math.max(1, Math.min(count, 7) - 1)));
  return <div className="pa-studio-rich pa-studio-plot"><strong>{title}</strong>
    <svg role="img" aria-label={title + '：' + series.length + ' 组曲线，数值 ' + fmt(low) + ' 至 ' + fmt(high) + unit} viewBox="0 0 396 200" className="pa-studio-line-visual">
      {ticks.map((tick, i) => <g key={i}><line x1="52" x2="368" y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity=".12"/><text x="45" y={y(tick)+4} textAnchor="end" fontSize="10" fill="currentColor">{fmt(tick)}</text></g>)}
      {series.map((entry, i) => <g key={i}>
        <polyline points={entry.values.map((value, j) => String(x(j)) + ',' + String(y(value))).join(' ')} fill="none" stroke={colors[i % colors.length]} strokeWidth="2.5" strokeLinecap="round"/>
        {entry.values.map((value, j) => <circle key={j} cx={x(j)} cy={y(value)} r="3.5" fill={colors[i % colors.length]}><title>{entry.name + ' · ' + (items[j] ?? String(j+1)) + ': ' + fmt(value) + unit}</title></circle>)}
      </g>)}
      <line x1="52" x2="368" y1="162" y2="162" stroke="currentColor" strokeOpacity=".5"/>
      {xIndices.map((index) => <text key={index} x={x(index)} y="183" textAnchor="middle" fontSize="10" fill="currentColor">{(items[index] ?? String(index+1)).slice(0,8)}</text>)}
    </svg>
    <div className="pa-studio-plot-legend">{series.map((entry,i) => <span key={i}><i style={{backgroundColor:colors[i%colors.length]}}/>{entry.name}</span>)}</div>
  </div>;
}
/** Reuse the same bounded, ID-checked GET contract for view and edit. */
async function getRemoteTableDetail(row: RemoteTableRow, props: Record<string, unknown>, idField: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = { ...row };
  if (!props.detailUrl) return snapshot;
  const endpoint = overlaySubmitUrl(props.detailUrl, 'edit-selected', row.key);
  if (!endpoint) throw new Error('详情接口需要包含一个有效的 {id} 占位符');
  const response = await fetch(endpoint, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (Number(response.headers.get('content-length') || 0) > 262144) throw new Error('详情超过 256 KB');
  const body = await response.text();
  if (body.length > 262144) throw new Error('详情超过 256 KB');
  const parsed = pathValue(JSON.parse(body) as unknown, label(props.detailPath, 'data'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('详情响应不是记录对象');
  const detail = parsed as Record<string, unknown>;
  const remoteId = detail[idField];
  if (remoteId !== undefined && String(remoteId) !== row.key) throw new Error('详情记录主键不匹配');
  // Shared data sources apply the same validated response field mappings to
  // detail GETs as list GETs. Raw and mapped IDs are both checked before the
  // selection can be used by an edit form.
  const mapped: Record<string, unknown> = { ...detail };
  if (props.sourceQueryMode === 'shared' && Array.isArray(props.fieldMappings)) {
    for (const entry of props.fieldMappings.slice(0, 24)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const mapping = entry as Record<string, unknown>;
      if (typeof mapping.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(mapping.field)
        || ['constructor', 'prototype', '__proto__'].includes(mapping.field) || typeof mapping.responsePath !== 'string') continue;
      const value = pathValue(detail, mapping.responsePath);
      if (value !== undefined) mapped[mapping.field] = value;
    }
  }
  const mappedId = mapped[idField];
  if (mappedId !== undefined && String(mappedId) !== row.key) throw new Error('详情映射后的记录主键不匹配');
  const result: Record<string, unknown> = { ...snapshot };
  for (const [key, value] of Object.entries(mapped)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || ['constructor','prototype','__proto__'].includes(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e12 ||
      typeof value === 'string' && value.length <= 240) result[key] = value;
  }
  return result;
}
type RemoteDeleteResult = { kind: 'success' | 'denied' | 'conflict' | 'failed' | 'uncertain'; reason: string };
/** An HTTP failure is not necessarily a rejected mutation: 5xx/transport may follow a committed DELETE. */
async function requestRemoteDelete(endpoint: string, signal: AbortSignal, etag?: string): Promise<RemoteDeleteResult> {
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE', credentials: 'same-origin', cache: 'no-store', signal,
      ...(etag ? { headers: { 'If-Match': etag } } : {})
    });
    if (response.ok) return { kind: 'success', reason: '' };
    const failure = classifyMutationHttpFailure(response.status);
    return { kind: failure.kind === 'invalid' ? 'failed' : failure.kind, reason: failure.message };
  } catch {
    return { kind: 'uncertain', reason: classifyMutationTransportFailure(signal.aborted).message };
  }
}
/** Server-controlled table: pagination/filtering/sorting are never emulated locally. */
function RemoteTableWidget({ props, live, onRecordSelect }: { props: Record<string, unknown>; live: boolean; onRecordSelect?: ((selection: OverlayRecordSelection) => void) | undefined }) {
  const title = label(props.title, '数据表格');
  const sourceUrl = apiUrl(props.dataUrl);
  const sourceError = label(props.sourceError);
  const sharedQuery = props.sourceQueryMode === 'shared';
  const mappingsKey = JSON.stringify(props.fieldMappings ?? []);
  const columns = parseRemoteTableColumns(props.tableColumns);
  const idField = label(props.idField, 'id');
  const itemsPath = label(props.itemsPath, 'data.items');
  const totalPath = label(props.totalPath, 'data.total');
  const deleteEtagField = label(props.deleteEtagField).trim();
  const sortField = label(props.sortField, 'name');
  const filterField = label(props.filterField);
  const filterValues = label(props.filterValues).split(',').map((value) => value.trim()).filter(Boolean).slice(0, 16);
  const pageSize = Math.max(1, Math.min(20, Number(props.pageSize) || 5));
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [direction, setDirection] = useState<'' | 'asc' | 'desc'>('');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<RemoteTablePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  // An uncertain DELETE may have committed upstream. Keep the lock across
  // list refreshes, page changes and cleared selection until an explicit acknowledgement.
  const [uncertainDeleteIds, setUncertainDeleteIds] = useState<string[]>([]);
  const uncertainDeleteLock = useRef(false);
  const lockUncertainDeletes = (ids: string[]) => {
    uncertainDeleteLock.current = true;
    setUncertainDeleteIds((previous) => [...new Set([...previous, ...ids])]);
  };
  const acknowledgeDeleteReview = () => {
    uncertainDeleteLock.current = false;
    setUncertainDeleteIds([]);
    setBulkSelectedKeys([]);
    setBulkOutcome(null);
    setDeleteError('');
    setRevision((previous) => previous + 1);
  };
  const [deletingId, setDeletingId] = useState('');
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<{ successful: string[]; failed: { id: string; reason: string }[]; conflict: { id: string; reason: string }[]; uncertain: { id: string; reason: string }[]; skipped: string[] } | null>(null);
  const [viewDetail, setViewDetail] = useState<{ id: string; status: 'loading' | 'ready' | 'error'; record: Record<string, unknown> | null; error: string } | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const deleteRequest = useRef<AbortController | null>(null);
  const batchRequest = useRef<AbortController | null>(null);
  const viewRequest = useRef<AbortController | null>(null);
  const currentTableSelection = useRef('');
  const deleteTemplate = label(props.deleteUrl);
  const deleteEnabled = Boolean(deleteTemplate);
  useEffect(() => () => { detailRequest.current?.abort(); deleteRequest.current?.abort(); batchRequest.current?.abort(); viewRequest.current?.abort(); }, []);
  const clearBulkSelection = () => { setBulkSelectedKeys([]); if (!uncertainDeleteLock.current) setBulkOutcome(null); };
  const closeView = () => {
    viewRequest.current?.abort();
    viewRequest.current = null;
    setViewDetail(null);
  };
  const viewRecord = async (row: RemoteTableRow) => {
    if (!live) return;
    viewRequest.current?.abort();
    const controller = new AbortController();
    viewRequest.current = controller;
    setViewDetail({ id: row.key, status: props.detailUrl ? 'loading' : 'ready', record: props.detailUrl ? null : { ...row }, error: '' });
    try {
      const record = await getRemoteTableDetail(row, props, idField, controller.signal);
      if (!controller.signal.aborted) setViewDetail({ id: row.key, status: 'ready', record, error: '' });
    } catch (problem) {
      if (!controller.signal.aborted) setViewDetail({ id: row.key, status: 'error', record: null, error: problem instanceof Error ? problem.message : '详情读取失败' });
    } finally {
      if (viewRequest.current === controller) viewRequest.current = null;
    }
  };
  const deleteSelectedRecords = async () => {
    if (!live || !deleteEnabled || !data || loading || bulkBusy || uncertainDeleteLock.current || batchRequest.current || deleteRequest.current) return;
    const visible = new Map(data.items.map((row) => [row.key, row]));
    const ids = bulkSelectedKeys.filter((id) => visible.has(id)).slice(0, 20);
    if (!ids.length) return;
    const endpoints = ids.map((id) => {
      const row = visible.get(id)!;
      return { id, url: overlaySubmitUrl(deleteTemplate, 'edit-selected', id),
        etag: deleteEtagField ? strongRecordEtag(row[deleteEtagField]) : undefined };
    });
    // Fail the entire batch before any side effect if a required precondition
    // is missing; mixed guarded and unguarded mutations would be unsafe.
    if (endpoints.some((item) => !item.url || (deleteEtagField && !item.etag))) {
      setBulkSelectedKeys([]);
      setBulkOutcome({ successful: [], failed: ids.map((id) => ({ id, reason: '删除地址或强 ETag 前置条件无效，未发送请求' })), conflict: [], uncertain: [], skipped: [] });
      return;
    }
    const controller = new AbortController();
    batchRequest.current = controller;
    setBulkBusy(true); setBulkOutcome(null);
    const successful: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    const conflict: { id: string; reason: string }[] = [];
    const uncertain: { id: string; reason: string }[] = [];
    const skipped: string[] = [];
    const timeout = setTimeout(() => controller.abort(), 60000);
    let blocked = false;
    try {
      for (const item of endpoints) {
        if (blocked || controller.signal.aborted) { skipped.push(item.id); continue; }
        const result = await requestRemoteDelete(item.url!, controller.signal, item.etag ?? undefined);
        if (result.kind === 'success') successful.push(item.id);
        else if (result.kind === 'conflict') conflict.push({ id: item.id, reason: result.reason });
        else if (result.kind === 'uncertain') {
          uncertain.push({ id: item.id, reason: result.reason });
          blocked = true; // Never issue subsequent writes after indeterminate outcome.
        } else failed.push({ id: item.id, reason: result.reason });
      }
      if (successful.some((id) => id === viewDetail?.id)) closeView();
      if (successful.includes(currentTableSelection.current)) {
        detailRequest.current?.abort();
        currentTableSelection.current = '';
        onRecordSelect?.({ selectedId: '', selected: null, detailStatus: 'idle' });
        setSelectionError('');
      }
      if (uncertain.length) lockUncertainDeletes(uncertain.map((item) => item.id));
      // Retry only definitive failures; conflict/unknown/skipped require
      // server-side reinspection and a fresh user selection.
      setBulkSelectedKeys(failed.map(({ id }) => id));
      setBulkOutcome({ successful, failed, conflict, uncertain, skipped });
      window.dispatchEvent(new Event('atlas:records-refresh'));
    } finally {
      clearTimeout(timeout);
      batchRequest.current = null;
      setBulkBusy(false);
    }
  };
  const deleteRecord = async (id: string) => {
    if (!live || !deleteEnabled || uncertainDeleteLock.current || deleteRequest.current || batchRequest.current || loading) return;
    const row = data?.items.find((item) => item.key === id);
    const endpoint = overlaySubmitUrl(deleteTemplate, 'edit-selected', id);
    const etag = deleteEtagField ? strongRecordEtag(row?.[deleteEtagField]) : undefined;
    if (!endpoint || (deleteEtagField && !etag)) {
      setDeleteError('删除地址或强 ETag 前置条件无效：未发送 DELETE，请刷新记录后重试');
      return;
    }
    const controller = new AbortController();
    deleteRequest.current = controller;
    setDeletingId(id); setDeleteError('');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await requestRemoteDelete(endpoint, controller.signal, etag ?? undefined);
      if (result.kind === 'success') {
        if (viewDetail?.id === id) closeView();
        setBulkSelectedKeys((previous) => previous.filter((key) => key !== id));
        setBulkOutcome(null);
        if (currentTableSelection.current === id) {
          detailRequest.current?.abort();
          currentTableSelection.current = '';
          onRecordSelect?.({ selectedId: '', selected: null, detailStatus: 'idle' });
          setSelectionError('');
        }
      } else {
        if (result.kind === 'uncertain') lockUncertainDeletes([id]);
        setDeleteError(result.kind === 'uncertain' ? '删除结果不确定：' + result.reason :
          result.kind === 'conflict' ? '删除冲突：' + result.reason :
          '删除失败：' + result.reason);
      }
      // Reconcile even on conflict/timeout: server state may have changed.
      window.dispatchEvent(new Event('atlas:records-refresh'));
    } finally {
      clearTimeout(timeout);
      deleteRequest.current = null;
      setDeletingId('');
    }
  };
  const chooseRecord = async (row: RemoteTableRow) => {
    if (!onRecordSelect || !live) return;
    detailRequest.current?.abort();
    setSelectionError('');
    const selectedId = row.key;
    currentTableSelection.current = selectedId;
    const snapshot: Record<string, unknown> = { ...row };
    if (!props.detailUrl) {
      onRecordSelect({ selectedId, selected: snapshot, detailStatus: 'idle' });
      return;
    }
    const controller = new AbortController();
    detailRequest.current = controller;
    onRecordSelect({ selectedId, selected: snapshot, detailStatus: 'loading' });
    try {
      const record = await getRemoteTableDetail(row, props, idField, controller.signal);
      if (!controller.signal.aborted) onRecordSelect({ selectedId, selected: record, detailStatus: 'ready' });
    } catch (reason) {
      if (!controller.signal.aborted) {
        setSelectionError(reason instanceof Error ? reason.message : '详情读取失败');
        onRecordSelect({ selectedId, selected: null, detailStatus: 'error' });
      }
    } finally {
      if (detailRequest.current === controller) detailRequest.current = null;
    }
  };
  useEffect(() => {
    if (!sourceUrl || !live) { setData(null); setLoading(false); setError(''); return; }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError('');
      try {
        if (!columns.length) throw new Error('表格列配置无效');
        const address = new URL(sourceUrl, window.location.href);
        if (sharedQuery) {
          const keys = [label(props.pageParam, 'page'), label(props.sizeParam, 'pageSize'),
            label(props.searchParam, 'search'), ...(filterField ? [label(props.filterParam, 'status')] : []),
            ...(sortField ? [label(props.sortParam, 'sortBy'), label(props.sortDirectionParam, 'sortOrder')] : [])];
          if (keys.some((key) => !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key)) || new Set(keys).size !== keys.length) {
            throw new Error('共享数据源查询参数存在无效或重复字段');
          }
          address.searchParams.set(keys[0]!, String(page));
          address.searchParams.set(keys[1]!, String(pageSize));
          if (search) address.searchParams.set(keys[2]!, search);
          else address.searchParams.delete(keys[2]!);
          if (filterField && filter && filterValues.includes(filter)) address.searchParams.set(keys[3]!, filter);
          else if (filterField) address.searchParams.delete(keys[3]!);
          if (sortField) {
            const sortKey = keys[filterField ? 4 : 3]!, orderKey = keys[filterField ? 5 : 4]!;
            if (direction) { address.searchParams.set(sortKey, sortField); address.searchParams.set(orderKey, direction); }
            else { address.searchParams.delete(sortKey); address.searchParams.delete(orderKey); }
          }
        } else {
          address.searchParams.set('page', String(page));
          address.searchParams.set('pageSize', String(pageSize));
          if (search) address.searchParams.set('search', search);
          if (filter && filterField) { address.searchParams.set('filterField', filterField); address.searchParams.set('filter', filter); }
          if (direction && sortField) { address.searchParams.set('sort', sortField); address.searchParams.set('order', direction); }
        }
        const response = await fetch(address.href, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (Number(response.headers.get('content-length') || 0) > 262144) throw new Error('数据超过 256 KB');
        const body = await response.text();
        if (body.length > 262144) throw new Error('数据超过 256 KB');
        const jsonBody: unknown = JSON.parse(body);
        const records = pathValue(jsonBody, itemsPath);
        const total = pathValue(jsonBody, totalPath);
        const rawMappings = Array.isArray(props.fieldMappings) ? props.fieldMappings.slice(0, 24) : [];
        const mapped = sharedQuery && Array.isArray(records) ? records.map((item: unknown) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
          const row: Record<string, unknown> = { ...(item as Record<string, unknown>) };
          for (const entry of rawMappings) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
            const mapping = entry as Record<string, unknown>;
            if (typeof mapping.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(mapping.field)
              || ['constructor', 'prototype', '__proto__'].includes(mapping.field) || typeof mapping.responsePath !== 'string') continue;
            const resolved = pathValue(item, mapping.responsePath);
            if (resolved !== undefined) row[mapping.field] = resolved;
          }
          return row;
        }) : records;
        const parsed = parseRemoteTablePage({ items: mapped, total }, idField, columns, deleteEtagField);
        if (!parsed) throw new Error('远程表格数据格式无效');
        if (!controller.signal.aborted) {
          // A successful DELETE (or concurrent server change) may remove the last
          // row of the last page. Re-query the last valid server page instead of
          // leaving a visually empty, out-of-range pagination cursor.
          const lastPage = Math.max(1, Math.ceil(parsed.total / pageSize));
          if (page > lastPage) {
            setData(null);
            setPage(lastPage);
            return;
          }
          setData(parsed); setError('');
          // Server-authoritative page membership: never keep unchecked,
          // deleted or cross-page IDs in a future bulk action.
          const present = new Set(parsed.items.map((row) => row.key));
          setBulkSelectedKeys((previous) => previous.filter((id) => present.has(id)));
        }
      } catch (caught) {
        if (!controller.signal.aborted) { setData(null); setError(caught instanceof Error ? caught.message : '请求失败'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [sourceUrl, idField, itemsPath, totalPath, props.tableColumns, sortField, filterField, page, pageSize, search, filter, direction, revision, live, deleteEtagField, sharedQuery, mappingsKey, props.pageParam, props.sizeParam, props.searchParam, props.filterParam, props.sortParam, props.sortDirectionParam]);
  useEffect(() => {
    if (!live || !sourceUrl) return;
    const refresh = () => setRevision((previous) => previous + 1);
    window.addEventListener('atlas:records-refresh', refresh);
    return () => window.removeEventListener('atlas:records-refresh', refresh);
  }, [live, sourceUrl]);
  if (sourceError) return <Alert type="error" showIcon message="共享表格数据源不可用" description={sourceError}/>;
  if (!sourceUrl || !live) return <div className="pa-studio-rich" data-atlas-table-source="static">
    <strong>{title}</strong>
    <Table size="small" rowKey="key" columns={[{ title: '事项', dataIndex: 'name' }, { title: '状态', dataIndex: 'status' }]}
      dataSource={rows(props.items)} pagination={{ pageSize, showSizeChanger: false }}/>
    {sourceUrl && !live ? <small>体验模式中加载服务端表格</small> : null}
  </div>;
  const displayColumns = columns.map(({key,title: heading}) => ({
    title: heading, dataIndex: key, key, sorter: key === sortField,
    sortOrder: key === sortField ? (direction === 'asc' ? 'ascend' as const : direction === 'desc' ? 'descend' as const : null) : null,
    render: (value: unknown) => value === null || value === undefined ? '—' : String(value)
  }));
  const selectionColumn = [{ title: '操作', key: 'action', render: (_: unknown, row: RemoteTableRow) =>
    <Space size="small">
      {onRecordSelect ? <Button size="small" onClick={() => { void chooseRecord(row); }}>选择</Button> : null}
      <Button size="small" onClick={() => { void viewRecord(row); }}>查看</Button>
      {deleteEnabled ? <Popconfirm title="确认删除记录？" description={'删除记录 ' + row.key + ' 后不能撤销。'} okText="确认删除" cancelText="取消"
        onConfirm={() => { void deleteRecord(row.key); }}>
        <Button size="small" danger disabled={!live || Boolean(deletingId) || bulkBusy || uncertainDeleteIds.length > 0} loading={deletingId === row.key}>删除</Button>
      </Popconfirm> : null}
    </Space> }];
  return <div className="pa-studio-rich pa-studio-remote-table" data-atlas-table-source="remote" data-atlas-delete-locked={uncertainDeleteIds.length > 0 ? 'true' : 'false'}>
    <strong>{title}</strong>
    <form className="pa-studio-widget-actions" onSubmit={(event) => { event.preventDefault(); clearBulkSelection(); setPage(1); setSearch(searchInput.trim().slice(0,120)); }}>
      <Input aria-label="表格搜索" placeholder="搜索记录" size="small" style={{ maxWidth: 210 }} maxLength={120} value={searchInput} onChange={(event)=>setSearchInput(event.target.value)} disabled={!live || bulkBusy}/>
      <Button size="small" htmlType="submit" disabled={bulkBusy}>查询</Button>
      {filterField && filterValues.length > 0 ? <select aria-label="表格筛选" value={filter} onChange={(event) => {clearBulkSelection(); setFilter(event.target.value); setPage(1);}} disabled={bulkBusy}>
        <option value="">全部状态</option>
        {filterValues.map((value) => <option key={value} value={value}>{value}</option>)}
      </select> : null}
      <Button size="small" onClick={()=>{clearBulkSelection(); setRevision((value)=>value+1);}} disabled={loading || bulkBusy}>刷新</Button>
    </form>
    {error ? <small role="alert">表格加载失败：{error}</small> : null}
    {selectionError ? <small role="alert">记录详情加载失败：{selectionError}</small> : null}
    {deleteError ? <small role="alert">{deleteError}</small> : null}
    {uncertainDeleteIds.length ? <Alert showIcon type="error"
      message={'删除操作已锁定：' + uncertainDeleteIds.length + ' 条记录的最终状态尚不确定'}
      description={<Space direction="vertical">
        <span>涉及记录：{uncertainDeleteIds.join('、')}。所有删除操作已暂停；请在真实服务端核对记录状态。刷新或重新选择不代表删除失败。</span>
        <Popconfirm title="确认已核对服务端最新状态？" description="解除锁定可能允许新的删除请求。请先核对记录是否仍存在，必要时确认记录版本；此操作不会自动验证服务端。" okText="已核对，解除锁定" cancelText="继续锁定" onConfirm={acknowledgeDeleteReview}>
          <Button size="small" danger>已核对服务端，解除删除锁定</Button>
        </Popconfirm>
      </Space>}/> : null}
    {deleteEnabled ? <div className="pa-studio-widget-actions">
      <small role="status">当前页已选择 {bulkSelectedKeys.length} 条（最多 {pageSize} 条；跨页不保留选择）</small>
      <Popconfirm title="确认批量删除？" description={'将逐条请求删除当前页选中的 ' + bulkSelectedKeys.length + ' 条记录。部分失败不会回滚已经成功的删除。'}
        okText="确认批量删除" cancelText="取消" onConfirm={() => { void deleteSelectedRecords(); }}>
        <Button size="small" danger loading={bulkBusy} disabled={loading || bulkBusy || Boolean(deletingId) || uncertainDeleteIds.length > 0 || !bulkSelectedKeys.length}>批量删除</Button>
      </Popconfirm>
      <Button size="small" disabled={bulkBusy || !bulkSelectedKeys.length} onClick={clearBulkSelection}>清空选择</Button>
    </div> : null}
    {bulkOutcome ? <Alert showIcon type={bulkOutcome.failed.length || bulkOutcome.conflict.length || bulkOutcome.uncertain.length || bulkOutcome.skipped.length ? 'warning' : 'success'}
      message={'批量删除：成功 ' + bulkOutcome.successful.length + ' 条，失败 ' + bulkOutcome.failed.length + ' 条，冲突 ' + bulkOutcome.conflict.length + ' 条，结果不确定 ' + bulkOutcome.uncertain.length + ' 条，未执行 ' + bulkOutcome.skipped.length + ' 条'}
      description={[
        ...bulkOutcome.failed.map((item) => item.id + '：' + item.reason),
        ...bulkOutcome.conflict.map((item) => item.id + '：' + item.reason),
        ...bulkOutcome.uncertain.map((item) => item.id + '：' + item.reason),
        ...(bulkOutcome.skipped.length ? ['尚未执行：' + bulkOutcome.skipped.join('、')] : [])
      ].join('；') + '。冲突、不确定和未执行记录必须先核对最新服务端状态后重新选择；仅确定失败项可再次确认重试。'}/> : null}
    <Drawer title={viewDetail ? '记录详情：' + viewDetail.id : '记录详情'} open={Boolean(viewDetail)} onClose={closeView} destroyOnHidden>
      {viewDetail?.status === 'loading' ? <Spin tip="正在加载详情"><div style={{ minHeight: 80 }}/></Spin> : null}
      {viewDetail?.status === 'error' ? <Alert type="error" showIcon message="记录详情加载失败" description={viewDetail.error}/> : null}
      {viewDetail?.status === 'ready' && viewDetail.record ?
        <Descriptions bordered size="small" column={1} items={Object.entries(viewDetail.record).filter(([key]) => key !== 'key').map(([key, value]) => ({
          key, label: columns.find((column) => column.key === key)?.title ?? key, children: value === null || value === undefined ? '—' : String(value)
        }))}/> : null}
    </Drawer>
    <Table<RemoteTableRow> size="small" rowKey="key" loading={loading || bulkBusy} dataSource={data?.items ?? []}
      {...(deleteEnabled ? { rowSelection: { selectedRowKeys: bulkSelectedKeys, onChange: (keys: (string | number | bigint)[]) => {
        if (!bulkBusy && !loading) {
          const visible = new Set(data?.items.map((item) => item.key) ?? []);
          setBulkSelectedKeys(keys.map(String).filter((id) => visible.has(id)).slice(0, 20));
          if (!uncertainDeleteLock.current) setBulkOutcome(null);
        }
      }, getCheckboxProps: () => ({ disabled: bulkBusy || loading || Boolean(deletingId) }) } } : {})}
      columns={[...displayColumns, ...selectionColumn]}
      pagination={{ current: page, pageSize, total: data?.total ?? 0, showSizeChanger: false }}
      onChange={(pagination, _filters, sorter) => {
        if (bulkBusy) return;
        const rule = Array.isArray(sorter) ? sorter[0] : sorter;
        if (rule?.field === sortField && rule.order) {
          clearBulkSelection();
          setDirection(rule.order === 'ascend' ? 'asc' : 'desc');
          setPage(1);
        } else if (rule?.field === sortField && !rule.order) {
          clearBulkSelection(); setDirection(''); setPage(1);
        } else if (pagination.current && pagination.current !== page) { clearBulkSelection(); setPage(pagination.current); }
      }}/>
    <small role="status">{error ? '服务器请求失败' : loading ? '正在加载…' : data ? ('共 ' + data.total + ' 条记录') : '尚无数据'}</small>
  </div>;
}

/** GET data source is strictly opt-in; editor mode never sends requests. */
function RemoteLineWidget({ props, live }: { props: Record<string, unknown>; live: boolean }) {
  const title = label(props.title, '趋势分析');
  const dataUrl = apiUrl(props.dataUrl);
  const dataPath = label(props.dataPath, 'data');
  const refreshMs = Math.min(60000, Math.max(0, Number(props.refreshMs) || 0));
  const interval = refreshMs > 0 ? Math.max(5000, refreshMs) : 0;
  const [dataset, setDataset] = useState<ChartDataset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!dataUrl || !live) { setDataset(null); setBusy(false); setError(''); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      setBusy(true);
      try {
        const response = await fetch(dataUrl, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        if (Number(response.headers.get('content-length') || 0) > 131072) throw new Error('数据超过 128 KB');
        const body = await response.text();
        if (body.length > 131072) throw new Error('数据超过 128 KB');
        const parsed = parseRemoteChartDataset(pathValue(JSON.parse(body) as unknown, dataPath));
        if (!parsed) throw new Error('图表数据结构无效（需要 items 和 series）');
        if (!controller.signal.aborted) { setDataset(parsed); setError(''); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : '数据加载失败');
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          if (interval) timer = setTimeout(() => { void load(); }, interval);
        }
      }
    };
    setDataset(null);
    void load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [dataUrl, dataPath, live, interval, revision]);
  const chart = dataset ?? { items: widgetItems(props.items), series: parseChartSeries(props.series, props.values) };
  return <div className="pa-studio-chart-remote" data-atlas-chart-source={dataset ? 'remote' : 'fallback'}>
    <LineWidget items={chart.items} series={chart.series} title={title} unit={label(props.unit)}/>
    {dataUrl ? <div className="pa-studio-widget-actions">
      <Button size="small" disabled={!live || busy} loading={busy} onClick={() => setRevision((value) => value + 1)}>刷新数据</Button>
      <small role="status">{error ? '数据读取失败：' + error : !live ? '体验模式中读取接口' : busy ? '正在加载…' : dataset ? (interval ? 'API 已更新 · 自动刷新' : 'API 已更新') : '显示备用数据'}</small>
    </div> : null}
  </div>;
}
/** Reuses the bounded button-workflow engine; prevents a second implicit form save. */
export function parseOverlayFollowup(value: unknown, validPages: readonly string[]): StudioWorkflow | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 5000) throw new Error('工作流配置超出长度限制。');
  let decoded: unknown;
  try { decoded = JSON.parse(value); } catch { throw new Error('工作流不是有效 JSON。'); }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('工作流结构无效。');
  const raw = decoded as { steps?: unknown };
  if (!Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 12) throw new Error('工作流需要 1–12 个步骤。');
  const workflow = normalizeStudioWorkflow(decoded, validPages);
  if (!workflow || workflow.steps.length !== raw.steps.length) throw new Error('工作流包含不支持的步骤。');
  for (const step of workflow.steps) {
    const actions = step.type === 'branch' ? [...step.onTrue, ...step.onFalse] : [step];
    if (actions.some((action) => action.type === 'save-record')) throw new Error('表单已自动保存，不允许在后续工作流重复保存。');
    if (step.type === 'branch') {
      const original = (raw.steps as unknown[]).find((item): item is { id: string; onTrue?: unknown; onFalse?: unknown } => !!item && typeof item === 'object' && (item as { id?: string }).id === step.id);
      if (!original || !Array.isArray(original.onTrue) || !Array.isArray(original.onFalse) || original.onTrue.length !== step.onTrue.length || original.onFalse.length !== step.onFalse.length) throw new Error('工作流条件分支包含无效步骤。');
    }
  }
  return workflow;
}

function OverlayWidget({ kind, props, live, recordSelection, workflowPages = [], onWorkflowNavigate }: { kind: 'modal' | 'drawer' | 'popconfirm'; props: Record<string, unknown>; live: boolean; recordSelection?: OverlayRecordSelection | undefined; workflowPages?: readonly string[] | undefined; onWorkflowNavigate?: ((pageId: string) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const editMode = props.formMode === 'edit-selected' && kind !== 'popconfirm';
  const [notify, context] = message.useMessage();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  // 5xx/timeouts can commit upstream even when the browser sees an error.
  // Never permit a blind second POST/PATCH in the same dialog session.
  const [uncertainWrite, setUncertainWrite] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const fieldInputs = useRef<Record<string, InputRef | null>>({});
  const formId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  const title = label(props.title, '操作确认');
  const description = label(props.description);
  const ok = label(props.okText, '确认'), cancel = label(props.cancelText, '取消');
  const formConfig = label(props.formFields);
  const fields = parseOverlayFormFields(formConfig);
  const hasForm = kind !== 'popconfirm' && Boolean(formConfig.trim());
  const selectedId = editMode ? recordSelection?.selectedId ?? '' : '';
  const url = editMode ? overlaySubmitUrl(props.submitUrl, 'edit-selected', editingId) : overlaySubmitUrl(props.submitUrl, 'create');
  useEffect(() => { if (open && editMode && recordSelection?.selectedId !== editingId) { setOpen(false); setSubmitError(''); } }, [open, editMode, editingId, recordSelection?.selectedId]);
  const runFollowup = async (key: 'successWorkflow' | 'failureWorkflow', snapshot: Record<string,string>, id: string) => {
    const raw = props[key];
    if (!raw) return;
    try {
      const workflow = parseOverlayFollowup(raw, workflowPages);
      if (!workflow) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        await runStudioWorkflow(workflow, {
          confirm: (question) => new Promise<boolean>((resolve) => {
            Modal.confirm({ title: '确认后续操作', content: question, onOk: () => { resolve(true); }, onCancel: () => { resolve(false); } });
          }),
          notify: (text) => { void notify.info(text); },
          navigate: (pageId) => {
            if (!workflowPages.includes(pageId)) throw new Error('后续工作流的目标页面不存在。');
            if (onWorkflowNavigate) onWorkflowNavigate(pageId);
            else window.location.hash = '#/' + pageId;
          },
          saveRecord: async () => { throw new Error('后续工作流不能再次保存当前表单。'); },
          refreshRecords: () => window.dispatchEvent(new Event('atlas:records-refresh')),
          ...(id ? { selectedId: id } : {}),
          draft: snapshot,
          signal: controller.signal,
          emit: (target, action) => dispatchWorkflowComponentEvent(target, action)
        });
      } finally { clearTimeout(timeout); controller.abort(); }
    } catch (problem) {
      const messageText = problem instanceof Error ? problem.message : '未知错误';
      setWorkflowError('后续工作流失败：' + messageText);
      void notify.error('后续动作失败：' + messageText);
    }
  };
  const close = () => { if (!pending.current) { setOpen(false); setDraft({}); setErrors({}); setSubmitError(''); } };
  const openDialog = () => {
    if (editMode && (!selectedId || !recordSelection?.selected || recordSelection.detailStatus === 'loading' || recordSelection.detailStatus === 'error')) return;
    const defaults: Record<string, string> = {};
    if (editMode && recordSelection?.selected) for (const field of fields) {
      const current = recordSelection.selected[field.key];
      defaults[field.key] = current === null || current === undefined ? '' : typeof current === 'string' || typeof current === 'number' ? String(current) : '';
    }
    setEditingId(selectedId);
    setDraft(defaults); setErrors({}); setSubmitError(''); setWorkflowError(''); setUncertainWrite(false); setOpen(true);
  };
  const trigger = <Button size="small" disabled={!live || (editMode && (!selectedId || !recordSelection?.selected || recordSelection.detailStatus === 'loading' || recordSelection.detailStatus === 'error'))} onClick={openDialog}>{label(props.triggerText, '打开')}</Button>;
  const confirmed = () => { setOpen(false); void notify.success('操作已确认（未关联后端）'); };
  const submit = async () => {
    if (!hasForm || !live || pending.current || uncertainWrite) return;
    if (editMode && (!editingId || recordSelection?.selectedId !== editingId)) { setSubmitError('所选记录已变化，请重新打开表单'); return; }
    if (!fields.length) { setSubmitError('字段配置有误，请检查每一行的字段名、标签、类型和必填设置'); return; }
    const result = validateOverlayForm(fields, draft);
    setErrors(result.errors);
    const invalidField = fields.find((field) => Boolean(result.errors[field.key]))?.key;
    if (invalidField) {
      fieldInputs.current[invalidField]?.focus();
      return;
    }
    if (props.sourceError) { setSubmitError(label(props.sourceError)); return; }
    if (!url) { setSubmitError(editMode ? '编辑模式需要含单个 {id} 的有效保存地址和选中记录' : '未配置有效的保存地址'); return; }
    let outgoing: Record<string, string | number>;
    try { outgoing = mapOverlaySubmitPayload(result.payload, props.saveFieldMappings); }
    catch (problem) { setSubmitError(problem instanceof Error ? problem.message : '保存字段映射无效'); return; }
    pending.current = true;
    setBusy(true); setSubmitError(''); setWorkflowError('');
    // Never expose password form values to follow-up workflow templates, alerts or logs.
    const snapshot = Object.fromEntries(Object.entries(draft).filter(([key]) => !fields.some((field) => field.key === key && field.type === 'password')));
    const submittedId = editMode ? editingId : '';
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 15000);
    let failure: MutationFailure | null = null;
    try {
      const response = await fetch(url, {
        method: props.submitMethod === 'PATCH' ? 'PATCH' : 'POST', credentials: 'same-origin', signal: request.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(outgoing)
      });
      if (!response.ok) {
        failure = classifyMutationHttpFailure(response.status);
        if (failure.refresh) window.dispatchEvent(new Event('atlas:records-refresh'));
        if (failure.kind === 'invalid') {
          // Error responses are untrusted: parse at most 16 KB and expose only
          // bounded, declared form fields. Never reflect arbitrary HTML/JSON.
          try {
            if (Number(response.headers.get('content-length') || 0) <= 16384) {
              const body = await response.text();
              if (body.length <= 16384) {
                const feedback = parseMutationFieldErrors(JSON.parse(body) as unknown, props.saveFieldMappings);
                const allowed = new Set(fields.map((field) => field.key));
                const visible = Object.fromEntries(Object.entries(feedback).filter(([key]) => allowed.has(key)));
                if (Object.keys(visible).length) {
                  setErrors((current) => ({ ...current, ...visible }));
                  const invalidField = fields.find((field) => Boolean(visible[field.key]))?.key;
                  if (invalidField) fieldInputs.current[invalidField]?.focus();
                }
              }
            }
          } catch { /* no field-level details; retain the stable error classification */ }
        }
        throw new Error(failure.message);
      }
      setOpen(false);
      setDraft({});
      // The standalone RecordProvider and Studio record flow both subscribe to this event.
      window.dispatchEvent(new Event('atlas:records-refresh'));
      void notify.success('保存成功，记录已刷新');
      await runFollowup('successWorkflow', snapshot, submittedId);
    } catch (reason) {
      if (!failure && (request.signal.aborted || reason instanceof TypeError)) {
        failure = classifyMutationTransportFailure(request.signal.aborted);
        window.dispatchEvent(new Event('atlas:records-refresh'));
      }
      if (failure?.kind === 'uncertain') {
        setUncertainWrite(true);
        setSubmitError('写入结果不确定：' + failure.message + '。本次弹窗已禁止重复提交；请先核对服务端最新记录状态，再关闭并重新打开。');
      } else setSubmitError(reason instanceof Error ? '保存失败：' + reason.message : '保存失败');
      // Failure workflows may contain mutations; do not run them for unknown
      // outcomes, even if a proxy committed before replying 503.
      if (failure?.kind !== 'uncertain') await runFollowup('failureWorkflow', snapshot, submittedId);
    } finally {
      clearTimeout(timeout); pending.current = false; controller.current = null; setBusy(false);
    }
  };
  const form = hasForm ? <div className="pa-studio-overlay-form">
    {description ? <p>{description}</p> : null}
    {fields.map((field) => <label className="pa-studio-field" key={field.key}><small>{field.label}{field.required ? ' *' : ''}</small>
      <Input ref={(instance) => { fieldInputs.current[field.key] = instance; }}
        id={`${formId}-${field.key}`} aria-label={field.label} aria-invalid={Boolean(errors[field.key])}
        aria-describedby={errors[field.key] ? `${formId}-${field.key}-error` : undefined}
        type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'password' ? 'password' : 'text'}
        maxLength={240} disabled={!live || busy} value={draft[field.key] ?? ''}
        onChange={(event) => { setDraft((values) => ({ ...values, [field.key]: event.target.value })); setErrors((current) => ({ ...current, [field.key]: '' })); }}/>
      {errors[field.key] ? <small id={`${formId}-${field.key}-error`} role="alert">{errors[field.key]}</small> : null}
    </label>)}
    {!fields.length ? <small role="alert">字段配置无效：格式为 key|标签|text/email/number/password|required/optional，每行一个</small> : null}
    {submitError ? <small role="alert">{submitError}</small> : null}
    {workflowError ? <small role="alert">{workflowError}</small> : null}
    {!url ? <small>编辑模式请设置含 {'{id}'} 的保存地址；新增模式设置普通地址</small> : null}
  </div> : description;
  const actions = hasForm ? <Space><Button disabled={busy} onClick={close}>{cancel}</Button><Button type="primary" loading={busy} disabled={!live || !fields.length || uncertainWrite} onClick={() => { void submit(); }}>{ok}</Button></Space> : undefined;
  return <div className="pa-studio-rich pa-studio-overlay"><strong>{title}</strong>{context}
    {kind === 'popconfirm' ? <Popconfirm title={title} description={description} open={open} onConfirm={confirmed} onCancel={close} okText={ok} cancelText={cancel}>{trigger}</Popconfirm> : trigger}
    {kind === 'modal' ? <Modal title={title} open={open} onOk={hasForm ? () => { void submit(); } : confirmed} onCancel={close} okText={ok} cancelText={cancel} okButtonProps={{ disabled: hasForm && (!live || !fields.length || uncertainWrite) }} confirmLoading={busy} closable={!busy} maskClosable={!busy} destroyOnHidden>{form}</Modal> : null}
    {kind === 'drawer' ? <Drawer title={title} open={open} onClose={close} placement={props.placement === 'left' ? 'left' : 'right'} width={Math.max(280, Math.min(800, Number(props.width) || 420))} closable={!busy} maskClosable={!busy} footer={actions} destroyOnHidden>{form}</Drawer> : null}
    <small>{hasForm ? (live ? (editMode ? '编辑选中记录；提交成功后刷新列表' : '新增表单；提交成功后刷新列表') : '切换到体验模式后可编辑和提交') : (live ? '可在体验模式操作；确认不会提交后端' : '切换到体验模式后可操作')}</small>
  </div>;
}
/** Live Studio widgets are backed by the same source code as the standalone React export. */
export function WidgetPreview({ kind, props, live, recordSelection, workflowPages, onWorkflowNavigate, onRecordSelect }: { kind: StudioWidgetKind; props: Record<string, unknown>; live: boolean; recordSelection?: OverlayRecordSelection | undefined; workflowPages?: readonly string[] | undefined; onWorkflowNavigate?: ((pageId: string) => void) | undefined; onRecordSelect?: ((selection: OverlayRecordSelection) => void) | undefined }) {
  const title = label(props.title, '组件');
  const items = widgetItems(props.items);
  const values = widgetValues(props.values);
  const percent = Math.max(0, Math.min(100, Number(props.percent) || 0));
  switch (kind) {
    // Ant Design 6 orientation enum is version-specific; omit optional orientation.
    case 'divider': return <Divider>{title}</Divider>;
    case 'tag': return <Tag color="processing">{label(props.text, title)}</Tag>;
    case 'alert': return <Alert type="info" showIcon message={title} description={label(props.description)}/>;
    case 'progress': return <div className="pa-studio-rich"><strong>{title}</strong><Progress percent={percent}/></div>;
    case 'breadcrumb': return <Breadcrumb items={items.map((item) => ({ title: item }))}/>;
    case 'avatar': return <Space><Avatar>{label(props.text, '张').slice(0, 2)}</Avatar><span>{title}</span></Space>;
    case 'image': { const url = safeWidgetImageUrl(props.src); return url ? <img className="pa-studio-rich-image" src={url} alt={title}/> : <div className="pa-studio-rich-image-placeholder">▧ {title}<small>{label(props.description)}</small></div>; }
    case 'steps': return <Steps responsive size="small" current={Math.max(0, Math.min(items.length, Math.floor(percent)))} items={items.map((item) => ({ title: item }))}/>;
    case 'timeline': return <Timeline items={items.map((item) => ({ children: item }))}/>;
    case 'table': return <RemoteTableWidget props={props} live={live} onRecordSelect={onRecordSelect}/>;
    case 'management-actions': return <SystemManagementAction props={props} live={live} recordSelection={recordSelection}/>;
    case 'chart': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-mini-chart">{values.map((value, index) => <div key={index} title={`${items[index] ?? `数据${index+1}`}：${value}`}><i style={{ height: `${Math.max(2,value)}%` }}/><small>{items[index] ?? index + 1}</small></div>)}</div></div>;
    case 'descriptions': return <Descriptions size="small" title={title} column={1} items={rows(props.items).map((row) => ({ key: row.key, label: row.name, children: row.status }))}/>;
    case 'list': return <div className="pa-studio-rich"><strong>{title}</strong><ul className="pa-studio-rich-list">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
    case 'statistic': return <Statistic title={title} value={label(props.value, '0')} suffix={label(props.suffix)}/>;
    case 'textarea': return <label className="pa-studio-field"><small>{title}</small><Input.TextArea rows={3} placeholder={label(props.placeholder)} disabled={!live}/></label>;
    case 'number': return <label className="pa-studio-field"><small>{title}</small><InputNumber style={{ width: '100%' }} defaultValue={Number(props.value) || 0} disabled={!live}/></label>;
    case 'checkbox': return <div className="pa-studio-rich"><strong>{title}</strong><Checkbox.Group disabled={!live} options={items.map((item) => ({ label: item, value: item }))}/></div>;
    case 'radio': return <div className="pa-studio-rich"><strong>{title}</strong><Radio.Group disabled={!live} options={items.map((item) => ({ label: item, value: item }))}/></div>;
    case 'toggle': return <Space><span>{title}</span><Switch disabled={!live}/></Space>;
    case 'date': return <label className="pa-studio-field"><small>{title}</small><DatePicker style={{ width: '100%' }} disabled={!live}/></label>;
    case 'slider': return <div className="pa-studio-rich"><strong>{title}</strong><Slider defaultValue={percent} disabled={!live}/></div>;
    case 'rate': return <Space><span>{title}</span><Rate disabled={!live}/></Space>;
    case 'modal': return <OverlayWidget kind="modal" props={props} live={live} recordSelection={recordSelection} workflowPages={workflowPages} onWorkflowNavigate={onWorkflowNavigate}/>;
    case 'drawer': return <OverlayWidget kind="drawer" props={props} live={live} recordSelection={recordSelection} workflowPages={workflowPages} onWorkflowNavigate={onWorkflowNavigate}/>;
    case 'popconfirm': return <OverlayWidget kind="popconfirm" props={props} live={live}/>;
    case 'skeleton': return <div className="pa-studio-rich"><strong>{title}</strong><Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }}/></div>;
    case 'empty': return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={label(props.description, title)}/>;
    case 'collapse': return <Collapse items={[{ key: 'one', label: title, children: <p>{label(props.text, '展开内容')}</p> }]}/>;
    case 'spinner': return <Space><Spin/><span>{title}</span></Space>;
    case 'file-upload': return <FileUploadWidget props={props} live={live}/>;
    case 'file-list': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-file-list">{rows(props.items).map((item) => <div key={item.key}><span>▤ {item.name}</span><small>{item.status}</small></div>)}</div></div>;
    case 'async-task': return <AsyncTaskWidget props={props} live={live}/>;
    case 'async-log': return <div className="pa-studio-rich"><strong>{title}</strong><ol className="pa-studio-async-log">{rows(props.items).map((item) => <li key={item.key}><span>{item.name}</span><Tag>{item.status}</Tag></li>)}</ol></div>;
    case 'line-chart': return <RemoteLineWidget props={props} live={live}/>;
    case 'donut-chart': { const share = Math.min(100, Math.max(0, Number(props.value) || 0)); return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-donut" role="img" aria-label={`${title} ${share}%`} style={{ background: `conic-gradient(#16936f ${share}%, #e4eee8 ${share}% 100%)` }}><div><strong>{share}{label(props.suffix, '%')}</strong><small>当前占比</small></div></div></div>; }
    case 'heatmap': return <div className="pa-studio-rich"><strong>{title}</strong><div className="pa-studio-heatmap" role="img" aria-label={`${title}，${values.length} 个值`}>{values.map((value, index) => <span key={index} title={`第 ${index+1} 格：${value}`} style={{ background: `rgba(18,133,94,${(.12 + value * .008).toFixed(2)})` }}/>)}</div></div>;
  }
}
