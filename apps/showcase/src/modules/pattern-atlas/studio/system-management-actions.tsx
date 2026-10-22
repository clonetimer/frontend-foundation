/** Management operations for Studio and generated React. No credentials, policy or synthetic grants. */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Popconfirm, Space, Switch, Tree } from 'antd';

export type ManagementMode = 'role-users' | 'role-permissions' | 'menu-tree' | 'status';
export type ManagementNode = { id: string; name: string; children?: ManagementNode[] };
export type ManagementSelection = { selectedId: string; selected: Record<string, unknown> | null; detailStatus?: string };

const object = (x: unknown): x is Record<string, unknown> => Boolean(x && typeof x === 'object' && !Array.isArray(x));
const strongEtag = (x: unknown): x is string => typeof x === 'string' && x.length <= 122 && /^"[\x21\x23-\x7e]{1,120}"$/.test(x);
const goodId = (id: unknown): id is string | number =>
  (typeof id === 'string' && id.length >= 1 && id.length <= 120) ||
  (typeof id === 'number' && Number.isSafeInteger(id));

/** Browsers never receive a token or executable URL expression in the design file. */
export function resolveManagementUrl(template: unknown, id = '', requireId = false): string | null {
  if (typeof template !== 'string' || !template || template.length > 500 ||
    /[\s\\]/.test(template) || template.startsWith('//') ||
    [...template].some((char) => char.charCodeAt(0) < 32)) return null;
  const matches = template.match(/\{id\}/g) ?? [];
  if (matches.length > 1 || (requireId && matches.length !== 1) || /[{}]/.test(template.replace(/\{id\}/g, ''))) return null;
  if (matches.length && (!id || id.length > 120)) return null;
  const url = template.replace('{id}', encodeURIComponent(id));
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? url : null;
  } catch { return null; }
}

/** A bounded, acyclic tree. IDs are unique across the entire response, not just siblings. */
export function parseManagementNodes(payload: unknown): ManagementNode[] {
  const root = object(payload) && object(payload.data) ? payload.data : null;
  if (!root || !Array.isArray(root.items)) throw new Error('候选数据需返回 data.items 数组。');
  const seen = new Set<string>();
  const parse = (list: unknown[], depth: number): ManagementNode[] => {
    if (depth > 7 || list.length > 200) throw new Error('菜单树层级或条目过多。');
    return list.map((entry) => {
      if (!object(entry) || !goodId(entry.id) || typeof entry.name !== 'string' ||
        !entry.name.trim() || entry.name.length > 100) throw new Error('候选条目 ID 或名称无效。');
      const id = String(entry.id);
      if (seen.has(id) || seen.size >= 200) throw new Error('候选条目重复或超过 200 个。');
      seen.add(id);
      if (entry.children !== undefined && !Array.isArray(entry.children)) throw new Error('菜单 children 必须是数组。');
      return { id, name: entry.name, ...(entry.children ? { children: parse(entry.children, depth + 1) } : {}) };
    });
  };
  return parse(root.items, 0);
}

/** Read assigned IDs and a strong compare-and-swap validator from one backend snapshot. */
export function parseManagementAssignment(payload: unknown): { ids: string[]; etag: string } {
  const data = object(payload) && object(payload.data) ? payload.data : null;
  if (!data || !Array.isArray(data.ids) || data.ids.length > 200 || !strongEtag(data.etag))
    throw new Error('关联查询必须返回 data.ids 和强 ETag（data.etag）。');
  const ids = data.ids.map((id) => {
    if (!goodId(id)) throw new Error('关联 ID 无效。');
    return String(id);
  });
  if (new Set(ids).size !== ids.length) throw new Error('关联 ID 重复。');
  return { ids, etag: data.etag };
}
async function requestJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { method: 'GET', credentials: 'same-origin', ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error('读取失败：HTTP ' + res.status);
  const raw = await res.text();
  if (raw.length > 120000) throw new Error('后端响应超过 120 KB。');
  try { return JSON.parse(raw) as unknown; } catch { throw new Error('后端响应不是有效 JSON。'); }
}
async function writeJson(method: 'PUT' | 'PATCH', url: string, body: object, etag: string): Promise<void> {
  const res = await fetch(url, { method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
}
const writeError = (error: unknown): string => {
  const detail = error instanceof Error ? error.message : '网络错误';
  if (/HTTP (401|403)/.test(detail)) return '无权执行此操作（' + detail + '）。';
  if (/HTTP (409|412|428)/.test(detail)) return '数据已变化或缺少版本条件。请重新读取后决定（' + detail + '）。';
  if (/HTTP (400|422)/.test(detail)) return '请求未通过后端校验（' + detail + '）。';
  return '写入结果不确定（' + detail + '）。请从后端重新读取确认，禁止盲目重复提交。';
};
const unsafeOutcome = (error: unknown): boolean => !(error instanceof Error && /HTTP (400|401|403|409|412|422|428)\b/.test(error.message));

export function SystemManagementAction({ props, live, recordSelection }: {
  props: Record<string, unknown>; live: boolean; recordSelection?: ManagementSelection;
}) {
  const mode: ManagementMode = props.actionMode === 'role-users' || props.actionMode === 'role-permissions' ||
    props.actionMode === 'menu-tree' || props.actionMode === 'status' ? props.actionMode : 'menu-tree';
  const id = recordSelection?.selectedId ?? '';
  const readySelection = Boolean(id && recordSelection?.selected && !['loading', 'error'].includes(recordSelection.detailStatus ?? ''));
  const optionsUrl = resolveManagementUrl(props.optionsUrl, id);
  const assignedUrl = resolveManagementUrl(props.assignedUrl, id, true);
  const writeUrl = resolveManagementUrl(props.submitUrl, id, true);
  const detailUrl = resolveManagementUrl(props.detailUrl, id, true);
  const isTree = mode === 'role-permissions' || mode === 'menu-tree';
  const isStatus = mode === 'status';
  const needsSelected = mode !== 'menu-tree';
  const configured = isStatus ? Boolean(detailUrl && writeUrl) :
    mode === 'menu-tree' ? Boolean(optionsUrl) : Boolean(optionsUrl && assignedUrl && writeUrl);
  const enabled = live && configured && (!needsSelected || readySelection);
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [nodes, setNodes] = useState<ManagementNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [etag, setEtag] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState('');
  const lock = useRef(false);
  const field = typeof props.statusField === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(props.statusField) ? props.statusField : 'status';
  const active = typeof props.activeValue === 'string' ? props.activeValue : 'enabled';
  const inactive = typeof props.inactiveValue === 'string' ? props.inactiveValue : 'disabled';
  const selectedStatus = recordSelection?.selected?.[field];
  const validStatus = typeof selectedStatus === 'string' && active !== inactive &&
    active.length > 0 && inactive.length > 0 && [active, inactive].includes(selectedStatus);
  const checked = selectedStatus === active;
  const selectedName = String(recordSelection?.selected?.name ?? recordSelection?.selected?.title ?? id).slice(0, 100);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setBlocked(false); setSelectedIds([]); setNodes([]); setEtag(''); setConfirmed(false);
    const load = async () => {
      try {
        if (!optionsUrl) throw new Error('未配置候选列表接口。');
        const results = await Promise.all([requestJson(optionsUrl, controller.signal),
          ...(mode === 'menu-tree' ? [] : [requestJson(assignedUrl!, controller.signal)])]);
        const entries = parseManagementNodes(results[0]);
        const assignment = mode === 'menu-tree' ? null : parseManagementAssignment(results[1]);
        if (assignment) {
          const known = new Set<string>();
          const walk = (items: ManagementNode[]) => { items.forEach((node) => { known.add(node.id); walk(node.children ?? []); }); };
          walk(entries);
          if (assignment.ids.some((entry) => !known.has(entry))) throw new Error('后端返回了不在候选集中的关联 ID，请检查分页与授权范围。');
        }
        if (!controller.signal.aborted) {
          setNodes(entries); setSelectedIds(assignment?.ids ?? []); setEtag(assignment?.etag ?? '');
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '读取失败');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [opened, mode, id, optionsUrl, assignedUrl]);

  useEffect(() => { setOpened(false); setBlocked(false); }, [id, mode, live]);

  const close = () => { if (lock.current) return; setOpened(false); };
  const submit = async () => {
    if (lock.current || !opened || !confirmed || !live || !writeUrl || !etag || !readySelection || blocked || loading) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await writeJson('PUT', writeUrl, mode === 'role-users' ? { userIds: selectedIds } : { menuIds: selectedIds }, etag);
      setOpened(false); window.dispatchEvent(new Event('atlas:records-refresh'));
    } catch (err) {
      setError(writeError(err)); setBlocked(unsafeOutcome(err));
      if (!unsafeOutcome(err)) setEtag(''); // Must reopen and GET a fresh snapshot for any conflict.
    } finally { lock.current = false; setBusy(false); }
  };
  const toggleStatus = async () => {
    if (lock.current || !enabled || !validStatus || !detailUrl || !writeUrl) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await requestJson(detailUrl);
      const data = object(response) && object(response.data) ? response.data : null;
      if (!data || !strongEtag(data.etag) || data[field] !== selectedStatus || (goodId(data.id) && String(data.id) !== id))
        throw new Error('状态或版本发生变化，请刷新列表后重新选择。');
      await writeJson('PATCH', writeUrl, { [field]: checked ? inactive : active }, data.etag);
      window.dispatchEvent(new Event('atlas:records-refresh'));
    } catch (err) {
      setError(writeError(err));
      window.dispatchEvent(new Event('atlas:records-refresh'));
    } finally { lock.current = false; setBusy(false); }
  };

  const title = mode === 'role-users' ? '关联人员' : mode === 'role-permissions' ? '分配菜单权限' :
    mode === 'menu-tree' ? '菜单权限树' : '启用状态';
  if (isStatus) return <div className="pa-studio-rich pa-system-action" data-system-action="status">
    <Space wrap><strong>{title}</strong><span>选中：{readySelection ? selectedName : '无'}</span>
      <Popconfirm title={'确定将此记录' + (checked ? '停用' : '启用') + '？'} description="将向后端发送一次带 If-Match 的 PATCH 请求。" onConfirm={() => void toggleStatus()} okText="确定" cancelText="取消">
        <Switch checked={checked} disabled={!enabled || !validStatus || busy} loading={busy} aria-label="切换记录状态"/>
      </Popconfirm>
    </Space>
    {!configured ? <small>请配置详情 GET 和状态 PATCH 地址；必须从后端取得强 ETag。</small> :
      !validStatus && readySelection ? <small>当前状态不属于启用／停用值，请核对映射后再操作。</small> : null}
    {error ? <Alert type="error" showIcon message={error}/> : null}
  </div>;

  type TreeItem = { key: string; title: string; children?: TreeItem[] };
  const treeData = (list: ManagementNode[]): TreeItem[] =>
    list.map((node) => ({ key: node.id, title: node.name, ...(node.children ? { children: treeData(node.children) } : {}) }));
  const filter = (list: ManagementNode[]): ManagementNode[] => list.flatMap((node) => [
    ...(node.name.toLowerCase().includes(search.trim().toLowerCase()) ? [node] : []),
    ...filter(node.children ?? [])
  ]);
  return <div className="pa-studio-rich pa-system-action" data-system-action={mode}>
    <Space wrap><strong>{title}</strong><Button size="small" disabled={!enabled} onClick={() => setOpened(true)}>{title}</Button></Space>
    {!configured ? <small>请配置真实后端接口后使用；这里不保存密钥或模拟权限。</small> : null}
    {needsSelected && !readySelection ? <small>请先从本页数据表格选择一条记录。</small> : null}
    <Modal title={title + (needsSelected ? ' · ' + selectedName : '')} open={opened}
      onCancel={close} onOk={mode === 'menu-tree' ? close : () => { void submit(); }}
      okText={mode === 'menu-tree' ? '关闭' : '确认保存到后端'} cancelText="取消"
      okButtonProps={{ disabled: loading || busy || Boolean(error) || blocked || (mode !== 'menu-tree' && !confirmed) }}
      confirmLoading={busy} closable={!busy} maskClosable={!busy} destroyOnHidden>
      {loading ? <p role="status">正在从后端读取…</p> : null}
      {error ? <Alert type="error" showIcon message={error}/> : null}
      {!loading && !error ? <>
        {!isTree ? <Input placeholder="筛选人员" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} aria-label="筛选可关联人员"/> : null}
        <div style={{maxHeight:330,overflow:'auto',marginTop:12}}>
          {isTree ? <Tree checkable={mode !== 'menu-tree'} checkStrictly defaultExpandAll
            treeData={treeData(nodes)} checkedKeys={selectedIds}
            onCheck={(keys) => setSelectedIds((Array.isArray(keys) ? keys : keys.checked).map(String))}/> :
            <Checkbox.Group value={selectedIds} onChange={(ids) => setSelectedIds(ids.map(String))}>
              <Space direction="vertical">{filter(nodes).map((node) =>
                <Checkbox key={node.id} value={node.id}>{node.name}</Checkbox>)}</Space>
            </Checkbox.Group>}
        </div>
        {mode !== 'menu-tree' ? <>
          <p>已选 {selectedIds.length} 项。保存会原子替换当前角色的关联集合。</p>
          <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
            我确认覆盖此角色现有的关联配置
          </Checkbox>
        </> : <p>菜单树仅展示后端数据。这里不修改菜单权限。</p>}
      </> : null}
    </Modal>
  </div>;
}
