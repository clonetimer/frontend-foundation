import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Alert, Button, Input, Popconfirm, Select, Space, Table, Tag, message, type TableColumnsType } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useApiTransport } from '@foundation/api';
import { useRuntimeConfig } from '@foundation/app';
import { Page, PageContent } from '@foundation/ui';
import { designPresets } from '../../pattern-atlas/center/presets';
import { accentChoices, defaultDesignConfig, readDesignConfig, type DesignConfig } from '../../pattern-atlas/effects/config';
import { ScopedRecordsTheme } from '../../pattern-atlas/pilot/ScopedRecordsTheme';
import {
  activatePilotRevision, canRollbackPilot, comparePilotDesign, createPilotRevision, disablePilot,
  emptyPilotState, getActivePilotRevision, parsePilotFile, rollbackPilot, serializePilotFile
} from '../../pattern-atlas/pilot/model';
import { readRecordsPilot, saveRecordsPilot, subscribeRecordsPilot } from '../../pattern-atlas/pilot/store';
import { getRecords, type RecordItem, type RecordStatus } from '../api/records-api';
import '../../pattern-atlas/pilot/styles.css';

const comparisonColumns: TableColumnsType<RecordItem> = [
  { title: 'ID', dataIndex: 'id', width: 96 },
  { title: '标题', dataIndex: 'title', ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 96, render: (status: RecordStatus) => <Tag>{status}</Tag> },
  { title: '更新时间', dataIndex: 'updatedAt', width: 148 }
];

const displayFields: Partial<Record<keyof DesignConfig, string>> = {
  accent: '强调色', surface: '明暗', density: '密度', radius: '圆角', motion: '动态策略', speed: '动画速度',
  font: '字体', typeScale: '字号', spacing: '间距', elevation: '阴影'
};

function RecordsPreviewTable({ items, loading, total }: { items: RecordItem[]; loading: boolean; total: number }) {
  return <>
    <div className="pa-pilot-preview-title"><strong>Records · 业务列表</strong><Tag>{loading ? '查询中' : `共 ${total} 条`}</Tag></div>
    <div className="pa-pilot-table-scroll"><Table<RecordItem>
      rowKey="id" columns={comparisonColumns} dataSource={items} loading={loading}
      pagination={false} size="small" scroll={{ x: 520 }} locale={{ emptyText: '当前没有记录' }}
    /></div>
  </>;
}

function downloadPilotFile(data: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'pattern-atlas-records-pilot-v1.json'; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function uniqueRevisionId(): string {
  // IDs are local snapshot identifiers, not authentication or security tokens.
  return `rev-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replaceAll('-', '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`}`;
}

export function Component() {
  const runtime = useRuntimeConfig();
  const available = runtime.features.records === true && runtime.features.patternAtlasPilot === true;
  const transport = useApiTransport();
  const [store, setStore] = useState(readRecordsPilot);
  const [draft, setDraft] = useState<DesignConfig>(readDesignConfig);
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [label, setLabel] = useState('Records · 试点方案');
  const [note, setNote] = useState('本轮仅改变列表主题，不改变筛选、数据源、分页及编辑逻辑。');
  const [messageApi, holder] = message.useMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => subscribeRecordsPilot(() => setStore(readRecordsPilot())), []);

  // Exactly one API request supplies both visual variants; the comparison cannot write data.
  const query = useQuery({
    queryKey: ['records', { page: 1, pageSize: 6, pilotCompare: true }],
    queryFn: () => getRecords(transport, { page: 1, pageSize: 6 }),
    enabled: available
  });
  const active = available ? getActivePilotRevision(store) : null;
  const reference = active?.design ?? defaultDesignConfig;
  const changes = useMemo(() => comparePilotDesign(reference, draft), [reference, draft]);
  const items = query.data?.items ?? [];

  function updateDraft<K extends keyof DesignConfig>(key: K, value: DesignConfig[K]): void {
    setDraft((current) => ({ ...current, [key]: value })); setSelectedPreset('custom');
  }
  function createRevision(enable: boolean): void {
    try {
      const id = uniqueRevisionId();
      const next = createPilotRevision(readRecordsPilot(), { id, createdAt: new Date().toISOString(), label, note, design: draft });
      saveRecordsPilot(enable ? activatePilotRevision(next, id) : next);
      void messageApi.success(enable ? '版本已保存并在此浏览器启用' : '候选版本已保存；Records 页面暂不改变');
    } catch (error) { void messageApi.error(error instanceof Error ? error.message : '保存失败'); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 150_000) { void messageApi.error('文件超过 150KB'); return; }
    try {
      const parsed = parsePilotFile(await file.text());
      saveRecordsPilot(parsed); // import never auto-enables the pilot
      if (parsed.revisions[0]) setDraft(parsed.revisions[0].design);
      setSelectedPreset('custom');
      void messageApi.success('已导入方案并保持试点关闭；确认版本后可手动启用');
    } catch (error) { void messageApi.error(error instanceof Error ? error.message : '导入失败'); }
  }

  if (!available) return <Page><PageContent>
    {holder}<Alert type="warning" showIcon message="Records 主题试点已由运行时配置关闭" description="请检查 runtime-config.json：需要同时启用 features.records 与 features.patternAtlasPilot。关闭开关不会影响现有 Records 列表。" />
    <p><Link to="/records">返回 Records 原版列表</Link></p>
  </PageContent></Page>;

  return <Page><PageContent><div className="pa-pilot-page">
    {holder}
    <header className="pa-pilot-hero"><div><div className="pa-pilot-kicker">PATTERN ATLAS / PHASE 05 · BUSINESS PILOT</div>
      <h1>在真实业务数据上，验证界面方案。</h1>
      <p>两侧读取同一份 Records API 响应。先比较，再保存不可变的设计版本，最后显式启用到业务列表；关闭试点即可恢复原有界面。</p>
    </div><div className="pa-pilot-hero-actions"><Link to="/patterns/config"><Button>↗ 返回配置中心</Button></Link><Link to="/records"><Button>查看 Records 页面 ↗</Button></Link></div></header>

    <section className="pa-pilot-status" aria-live="polite"><div>
      <strong>{active ? `已启用 · ${active.label}` : '当前为原版模式'}</strong>
      <p>{active ? '局部主题仅对当前浏览器的 Records 列表生效，可即时撤回。' : `保留原有业务视图；本地有 ${store.revisions.length} 个可选择的设计版本。`}</p>
    </div><div className="pa-pilot-status-actions">
      <Tag color={active ? 'green' : 'default'}>{active ? '试点开启' : '试点关闭'}</Tag>
      <Button disabled={!canRollbackPilot(store)} onClick={() => { saveRecordsPilot(rollbackPilot(store)); void messageApi.info('已回退到更早保存的版本'); }}>↶ 回退上一版本</Button>
      <Button danger disabled={!active} onClick={() => { saveRecordsPilot(disablePilot(store)); void messageApi.info('已恢复 Records 原版'); }}>恢复原版（关闭试点）</Button>
    </div></section>

    <div className="pa-pilot-grid"><aside className="pa-pilot-panel"><div className="pa-pilot-section-kicker">01 / CONFIGURE CANDIDATE</div><h2>候选设计</h2><p>修改只影响右侧对照预览。只有点击「保存并启用」后才影响业务列表。</p>
      <label className="pa-pilot-field">风格预设
        <Select value={selectedPreset} options={[{ value: 'custom', label: '自定义 / 配置中心参数' }, ...designPresets.map((preset) => ({ value: preset.id, label: preset.name }))]}
          onChange={(id: string) => { setSelectedPreset(id); const preset = designPresets.find((item) => item.id === id); if (preset) setDraft({ ...preset.design }); }} />
      </label>
      <Button block onClick={() => { setDraft(readDesignConfig()); setSelectedPreset('custom'); }}>↻ 从配置中心载入最新参数</Button>
      <div className="pa-pilot-choices" style={{ marginTop: 15 }}>
        <label className="pa-pilot-field">强调色<Select<DesignConfig['accent']> value={draft.accent} options={accentChoices.map((choice) => ({ value: choice.value, label: choice.label }))} onChange={(value) => updateDraft('accent', value)} /></label>
        <label className="pa-pilot-field">明暗主题<Select<DesignConfig['surface']> value={draft.surface} options={[{ value: 'light', label: '明亮' }, { value: 'dark', label: '深色' }]} onChange={(value) => updateDraft('surface', value)} /></label>
        <label className="pa-pilot-field">组件密度<Select<DesignConfig['density']> value={draft.density} options={[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]} onChange={(value) => updateDraft('density', value)} /></label>
        <label className="pa-pilot-field">圆角<Select<DesignConfig['radius']> value={draft.radius} options={[{ value: 'soft', label: '柔和' }, { value: 'square', label: '方正' }, { value: 'round', label: '圆润' }]} onChange={(value) => updateDraft('radius', value)} /></label>
      </div>
      <div className="pa-pilot-diff"><strong>与{active ? '当前已启用版本' : '默认方案'}相比：</strong>
        {changes.length ? changes.map((item) => <Tag key={item.field}>{displayFields[item.field] ?? item.field} · {item.before} → {item.after}</Tag>) : <Tag color="green">设计参数一致</Tag>}
      </div>
      <div className="pa-pilot-section-kicker" style={{ marginTop: 16 }}>02 / SAVE SNAPSHOT</div><h2>保存版本</h2>
      <label className="pa-pilot-field" htmlFor="pa-pilot-revision-label">版本名称
        <Input id="pa-pilot-revision-label" value={label} maxLength={70} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="pa-pilot-field" htmlFor="pa-pilot-revision-note">变更说明
        <Input.TextArea id="pa-pilot-revision-note" value={note} maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="pa-pilot-buttons"><Button onClick={() => createRevision(false)}>保存候选版本</Button><Button type="primary" onClick={() => createRevision(true)}>保存并启用到 Records</Button></div>
      <p className="pa-pilot-hint" style={{ marginTop: 14 }}>仅本地浏览器生效。不会写入服务器、改变用户权限、覆盖 Foundation 全局主题或修改现有记录。</p>
    </aside>

    <section className="pa-pilot-panel"><div className="pa-pilot-compare-heading"><div><div className="pa-pilot-section-kicker">03 / SAME DATA, DIFFERENT DESIGN</div><h2>原版 / 候选版对照</h2></div><Button onClick={() => void query.refetch()} loading={query.isFetching}>刷新共享数据</Button></div>
      <p>两个预览使用同一批 <code>GET /api/records</code> 数据，展示相同字段且只读；业务列表的搜索、分页、编辑流程仍在 <Link to="/records">Records 页面</Link>进行。</p>
      {query.isError ? <Alert showIcon type="error" message="业务 API 查询失败" description="没有伪造数据；请检查开发服务器的 /api/records 接口。" action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>} style={{ marginBottom: 12 }}/>:null}
      <div className="pa-pilot-compare"><div className="pa-pilot-compare-card"><div className="pa-pilot-compare-label"><strong>01 · 原版（继承 Foundation 主题）</strong><small>不叠加配置</small></div>
        <div className="pa-pilot-original"><RecordsPreviewTable items={items} loading={query.isPending} total={query.data?.total ?? 0}/></div>
      </div><div className="pa-pilot-compare-card"><div className="pa-pilot-compare-label"><strong>02 · 候选版（真实 AntD Token）</strong><small>未发布时仅预览</small></div>
        <ScopedRecordsTheme design={draft} variant="compare"><RecordsPreviewTable items={items} loading={query.isPending} total={query.data?.total ?? 0}/></ScopedRecordsTheme>
      </div></div>
      <p className="pa-pilot-footnote">本演示的 API 在 Showcase Vite dev server 中由内存数据提供；这是真实的现有数据调用链路，但不是生产业务服务。两侧均不提供写入操作。</p>
    </section></div>

    <section className="pa-pilot-panel pa-pilot-history"><div className="pa-pilot-compare-heading"><div><div className="pa-pilot-section-kicker">04 / REVISION HISTORY & ROLLBACK</div><h2>版本历史（最多 12 个）</h2></div>
      <Space wrap><Button onClick={() => downloadPilotFile(serializePilotFile(store))}>↓ 导出版本 JSON</Button>
        <Button onClick={() => fileRef.current?.click()}>↑ 导入版本 JSON</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importFile(event)}/>
        <Popconfirm title="清空试点及全部本地版本？" description="此操作仅影响本浏览器的试点配置，不影响真实 Records 数据。" okText="清空" cancelText="取消" onConfirm={() => { saveRecordsPilot(emptyPilotState); void messageApi.success('已清空本地试点，恢复原版'); }}><Button danger>清空试点</Button></Popconfirm>
      </Space></div>
      {store.revisions.length ? <div className="pa-pilot-revisions">{store.revisions.map((revision) => {
        const isActive = active?.id === revision.id;
        return <article key={revision.id} className="pa-pilot-revision" data-active={isActive}>
          <Tag color={isActive ? 'green' : 'default'}>{isActive ? '当前启用' : '历史快照'}</Tag>
          <h3>{revision.label}</h3><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString('zh-CN')}</time>
          <p>{revision.note || '无变更备注'}</p>
          <Space wrap><Button size="small" aria-label={`将版本 ${revision.label} 载入预览`} onClick={() => { setDraft(revision.design); setSelectedPreset('custom'); void messageApi.info('已将快照载入右侧候选预览，尚未启用'); }}>载入预览</Button>
            <Button size="small" type={isActive ? 'default' : 'primary'} aria-label={`启用版本 ${revision.label}`} disabled={isActive} onClick={() => { saveRecordsPilot(activatePilotRevision(store, revision.id)); setDraft(revision.design); setSelectedPreset('custom'); void messageApi.success('已切换到选定版本'); }}>启用此版本</Button>
          </Space>
        </article>;
      })}</div> : <Alert showIcon type="info" message="尚未保存版本" description="可以先在左侧调整设计，再保存一个候选快照；不启用就不会修改 Records 页面。"/>}
      <p className="pa-pilot-footnote">安全约束：不接受任意 CSS/JS、仅允许白名单设计参数；导入后强制关闭试点，需人工确认；刷新页面及同源标签页可同步本地选择。恢复原版并不会删除历史。</p>
    </section>
  </div></PageContent></Page>;
}
