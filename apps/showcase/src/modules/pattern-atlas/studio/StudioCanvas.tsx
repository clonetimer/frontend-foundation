import { useEffect, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { Button, Input, Modal, Popconfirm, Select, message } from 'antd';
import { createPortal } from 'react-dom';
import type { CompositionNode } from '../bridge';
import { mayContain, nodeLabel, type StudioDecoration } from './model';
import { displayApiValue, requestStudioApi, validApiUrl } from './api';
import { recordId, recordText } from './record-bindings';
import type { StudioRecordFlow } from './StudioRecords';
import type { StudioDataSource } from './data-sources';
import { WidgetPreview } from './WidgetPreview';
import { dispatchWorkflowComponentEvent, runStudioWorkflow, type WorkflowTrace } from './studio-workflows';

export interface CanvasProps {
  node: CompositionNode;
  selectedId?: string | undefined;
  decorations: Record<string, StudioDecoration>;
  pageId?: string;
  live?: boolean;
  readOnly?: boolean;
  onSelect?: ((id: string) => void) | undefined;
  onDropItem?: ((targetId: string, where: 'inside' | 'before' | 'after', event: DragEvent<HTMLElement>) => void) | undefined;
  onNavigate?: ((pageId: string) => void) | undefined;
  depth?: number;
  recordFlow?: StudioRecordFlow | undefined;
  dataSources?: readonly StudioDataSource[] | undefined;
  workflowPages?: readonly string[] | undefined;
  absoluteLayer?: HTMLDivElement | null | undefined;
  onWorkflowTrace?: ((entry: WorkflowTrace) => void) | undefined;
}
function text(value: unknown, fallback = ''): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback; }
function number(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
const BUTTON_TYPES = ['primary', 'default', 'dashed', 'link', 'text'] as const;
const dropTypes = new Set(['application/x-atlas-palette', 'application/x-atlas-node']);
const clickableEffects = new Set(['flip', 'morph-toggle', 'success-check', 'ripple']);
function hasStudioDrag(event: DragEvent<HTMLElement>): boolean { return Array.from(event.dataTransfer.types).some((type) => dropTypes.has(type)); }
function confirmAction(content: string): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({ title: '确认操作', content, onOk: () => { resolve(true); }, onCancel: () => { resolve(false); } });
  });
}

export function StudioCanvas({ node, selectedId, decorations, pageId = '', live = false, readOnly = false, onSelect, onDropItem, onNavigate, depth = 0, recordFlow, dataSources, workflowPages, absoluteLayer, onWorkflowTrace }: CanvasProps) {
  const [active, setActive] = useState(false);
  const [tab, setTab] = useState(0);
  const decoration = decorations[`${pageId}:${node.id}`] ?? decorations[node.id] ?? {};
  const props = node.props ?? {};
  const api = decoration.api;
  const canLoadApi = live && !decoration.recordField && (node.type === 'metric' || node.type === 'text') && api?.method === 'GET' && validApiUrl(api.url);
  const [remote, setRemote] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; text: string }>({ status: 'idle', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  useEffect(() => {
    if (!canLoadApi || !api) { setRemote({ status: 'idle', text: '' }); return; }
    const controller = new AbortController();
    setRemote({ status: 'loading', text: '' });
    void requestStudioApi(api, controller.signal).then((value) => {
      if (!controller.signal.aborted) setRemote({ status: 'done', text: displayApiValue(value) });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRemote({ status: 'error', text: error instanceof Error ? error.message : '接口请求失败' });
    });
    return () => controller.abort();
  }, [canLoadApi, api?.url, api?.responsePath, api?.method]);
  const children = node.children ?? [];
  const editable = !readOnly;
  const effect = decoration.effect ?? '';
  const canDropInto = mayContain(node);
  const selected = editable && node.id === selectedId;
  const pattern = decoration.pattern ?? 'default';
  const childProps = { decorations, selectedId, pageId, live, readOnly, onSelect, onDropItem, onNavigate, recordFlow, dataSources, workflowPages, absoluteLayer, onWorkflowTrace, depth: depth + 1 };
  const childElements = (list: CompositionNode[]) => list.map((item) => <StudioCanvas key={item.id} node={item} {...childProps}/>);
  const report = (event: DragEvent<HTMLElement>, where: 'inside' | 'before' | 'after') => {
    if (!editable || !onDropItem) return;
    event.preventDefault(); event.stopPropagation();
    onDropItem(node.id, where, event);
  };
  const accept = (event: DragEvent<HTMLElement>) => { if (editable && hasStudioDrag(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; } };
  const select = (event: MouseEvent<HTMLElement>) => {
    if (live && !editable && clickableEffects.has(effect) && node.kind === 'widget' && node.type !== 'button') {
      if (event.target instanceof Element && event.target.closest('button,input,textarea,select,[role=combobox]')) return;
      event.stopPropagation(); setActive((previous) => !previous); return;
    }
    if (!editable) return;
    event.stopPropagation(); onSelect?.(node.id);
  };
  const trigger = async () => {
    if (!live) { onSelect?.(node.id); return; }
    if (decoration.workflow?.steps.length) {
      setSubmitting(true);
      try {
        await runStudioWorkflow(decoration.workflow, {
          confirm: confirmAction,
          notify: (text) => { void message.info(text || '操作完成'); },
          navigate: (target) => onNavigate?.(target),
          saveRecord: async () => { if (!decoration.recordSubmit || !recordFlow) throw new Error('此按钮还没有可用的记录保存绑定。'); await recordFlow.save(decoration.recordSubmit); },
          refreshRecords: () => recordFlow?.retry(),
          ...(recordFlow?.selectedId ? { selectedId: recordFlow.selectedId } : {}),
          ...(recordFlow?.draft ? { draft: recordFlow.draft } : {}),
          ...(onWorkflowTrace ? { onTrace: (trace: WorkflowTrace) => onWorkflowTrace({ ...trace, sourceId: node.id }) } : {}),
          emit: (targetId, action) => dispatchWorkflowComponentEvent(targetId,action)
        });
      } catch (error) { void message.error(error instanceof Error ? error.message : '工作流执行失败'); }
      finally { setSubmitting(false); }
      return;
    }
    if (decoration.interaction === 'notice') void message.info(decoration.feedback || `已操作：${nodeLabel(node)}`);
    // A toggle interaction combined with a stateful effect must flip only once.
    // Keep canvas behavior consistent with the exported React handlePress() logic.
    if (decoration.interaction === 'toggle' || ['flip', 'morph-toggle', 'success-check'].includes(effect)) setActive((old) => !old);
    if (decoration.interaction === 'navigate' && decoration.targetPage) onNavigate?.(decoration.targetPage);
    if (decoration.recordSubmit) {
      if (!(await confirmAction('将提交当前记录修改，是否继续？'))) return;
      setSubmitting(true);
      try { await recordFlow?.save(decoration.recordSubmit); void message.success('记录已保存，列表正在刷新'); }
      catch (error) { void message.error(error instanceof Error ? error.message : '保存失败'); }
      finally { setSubmitting(false); }
      return;
    }
    if (api?.method === 'POST') {
      if (!(await confirmAction('将向真实后端发送 POST 请求，确定继续？'))) return;
      if (!validApiUrl(api.url)) { void message.warning('请先配置有效的接口地址'); return; }
      setSubmitting(true);
      try { await requestStudioApi(api); void message.success('接口请求成功'); }
      catch (error) { void message.error(error instanceof Error ? error.message : '接口请求失败'); }
      finally { setSubmitting(false); }
    }
  };
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!live || (effect !== 'spotlight' && effect !== 'tilt')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1)));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / (rect.height || 1)));
    event.currentTarget.style.setProperty('--atlas-pointer-x', `${(x * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty('--atlas-pointer-y', `${(y * 100).toFixed(1)}%`);
    if (effect === 'tilt') {
      event.currentTarget.style.setProperty('--atlas-rotate-x', `${((.5 - y) * 7).toFixed(1)}deg`);
      event.currentTarget.style.setProperty('--atlas-rotate-y', `${((x - .5) * 7).toFixed(1)}deg`);
    }
  };
  let visual: React.ReactNode;
  if (node.kind === 'layout') {
    const gap = number(props.gap, 14);
    if (node.type === 'tabs') {
      visual = <div className="pa-studio-tabs"><div className="pa-studio-tabs-nav">{children.map((item, index) => <button type="button" key={item.id} className={index === tab ? 'is-current' : ''} onClick={(event) => { event.stopPropagation(); setTab(index); }}>{item.label ?? `标签 ${index + 1}`}</button>)}</div>{children[tab] ? childElements([children[tab]]) : null}</div>;
    } else {
      const layoutStyle: CSSProperties = node.type === 'grid' ? { display: 'grid', gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, number(props.columns, 2)))},minmax(0,1fr))`, gap } : node.type === 'split' ? { display: 'grid', gridTemplateColumns: `minmax(0,1fr) minmax(175px,${number(props.secondarySize, 280)}px)`, gap } : { display: 'flex', flexDirection: props.direction === 'horizontal' ? 'row' : 'column', gap, alignItems: props.align === 'center' ? 'center' : 'stretch', flexWrap: props.wrap ? 'wrap' : 'nowrap' };
      visual = <div className={`pa-studio-layout pa-layout-${node.type} pa-pattern-${pattern}`} style={layoutStyle}>
        {childElements(children)}
        {editable && canDropInto && node.type !== 'split' ? <div className="pa-studio-drop-end" onDragOver={accept} onDrop={(event) => report(event, 'inside')}>＋ 拖入组件</div> : null}
        {children.length === 0 && (readOnly || !editable) ? <div className="pa-studio-empty">空布局</div> : null}
      </div>;
    }
  } else if (node.type === 'panel') {
    visual = <div className="pa-studio-panel"><div className="pa-studio-panel-head"><strong>{text(props.title, '卡片')}</strong>{typeof props.description === 'string' ? <small>{props.description}</small> : null}</div><div className="pa-studio-panel-body">{childElements(children)}{editable ? <div className="pa-studio-drop-end" onDragOver={accept} onDrop={(event) => report(event, 'inside')}>＋ 拖入内容</div> : null}</div></div>;
  } else if (node.type === 'text') {
    const value = live && decoration.recordField ? (recordFlow?.draft[decoration.recordField.field] ?? recordText(recordFlow?.selected?.[decoration.recordField.field])) : remote.status === 'done' ? remote.text : remote.status === 'loading' ? '加载中…' : remote.status === 'error' ? `请求失败：${remote.text}` : text(props.text, '文字');
    visual = props.variant === 'title' ? <h2 className="pa-studio-text-title">{value}</h2> : props.variant === 'subtitle' ? <h3 className="pa-studio-text-subtitle">{value}</h3> : <p className={props.variant === 'secondary' ? 'pa-studio-text muted' : 'pa-studio-text'}>{value}</p>;
  } else if (node.type === 'metric') {
    visual = <div className="pa-studio-metric"><small>{text(props.label, '指标')}</small><strong>{live && decoration.recordField ? (recordFlow?.draft[decoration.recordField.field] ?? recordText(recordFlow?.selected?.[decoration.recordField.field])) : remote.status === 'done' ? remote.text : remote.status === 'loading' ? '加载中…' : remote.status === 'error' ? '读取失败' : text(props.value)}{remote.status !== 'error' && remote.status !== 'loading' ? text(props.suffix) : ''}</strong>{remote.status === 'error' ? <span role="alert" title={remote.text}>{remote.text}</span> : null}{props.description ? <span>{text(props.description)}</span> : null}</div>;
  } else if (node.type === 'button') {
    const option = BUTTON_TYPES.find((item) => item === props.type) ?? 'default';
    visual = <div className="pa-studio-control"><Button type={option} disabled={Boolean(props.disabled) || submitting || (live && Boolean(decoration.recordSubmit) && (!recordFlow?.selected || recordFlow.detailStatus === 'loading' || recordFlow.detailStatus === 'error'))} loading={submitting} onClick={(event) => { event.stopPropagation(); void trigger(); }}>{text(props.label, '按钮')}{active && decoration.interaction === 'toggle' ? ' ✓' : ''}</Button>{active && decoration.interaction === 'toggle' ? <small>已切换</small> : null}</div>;
  } else if (node.type === 'input') {
    visual = <label className="pa-studio-field"><small>{text(props.label, '输入')}</small><Input aria-label={text(props.label, '输入')} {...(decoration.recordField ? { value: live ? recordFlow?.draft[decoration.recordField.field] ?? '' : text(props.defaultValue), readOnly: !live, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { if (live) recordFlow?.edit(decoration.recordField!.field, event.target.value); } } : { defaultValue: text(props.defaultValue) })} placeholder={text(props.placeholder, '请输入…')} disabled={Boolean(props.disabled) || (live && Boolean(decoration.recordField) && (!recordFlow?.selected || recordFlow.detailStatus === 'loading' || recordFlow.detailStatus === 'error'))} {...(live && decoration.recordField && recordFlow?.errors[decoration.recordField.field] ? { status: 'error' as const } : {})} onClick={(event) => { if (!live) { event.stopPropagation(); onSelect?.(node.id); } }}/>{live && decoration.recordField && recordFlow?.errors[decoration.recordField.field] ? <span role="alert" className="pa-studio-record-error">{recordFlow.errors[decoration.recordField.field]}</span> : null}</label>;
  } else if (node.type === 'select') {
    const options = Array.isArray(props.options) ? props.options.filter((item): item is { label: string; value: string } => typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).label === 'string' && typeof (item as Record<string, unknown>).value === 'string') : [];
    visual = <label className="pa-studio-field"><small>{text(props.label, '选择')}</small><Select style={{ width: '100%' }} options={options} {...(live && decoration.recordField ? { value: recordFlow?.draft[decoration.recordField.field] ?? null, onChange: (value: string) => recordFlow?.edit(decoration.recordField!.field, value) } : {})} placeholder={text(props.placeholder, '请选择')} disabled={Boolean(props.disabled) || (live && Boolean(decoration.recordField) && (!recordFlow?.selected || recordFlow.detailStatus === 'loading' || recordFlow.detailStatus === 'error'))} {...(live && decoration.recordField && recordFlow?.errors[decoration.recordField.field] ? { status: 'error' as const } : {})} onClick={(event) => { if (!live) { event.stopPropagation(); onSelect?.(node.id); } }}/>{live && decoration.recordField && recordFlow?.errors[decoration.recordField.field] ? <span role="alert" className="pa-studio-record-error">{recordFlow.errors[decoration.recordField.field]}</span> : null}</label>;
  } else if (node.type === 'placeholder' && decoration.recordList) {
    const config = decoration.recordList;
    visual = <div className="pa-studio-record-list"><strong>{text(props.title, '记录列表')}</strong>
      {!live ? <div className="pa-studio-record-hint">数据源：{recordFlow?.sourceUrl || config.url || '尚未连接'}<small>体验模式中可筛选、选择记录并编辑表单。</small></div> : <>
        <form className="pa-studio-record-search" onSubmit={(event) => { event.preventDefault(); recordFlow?.applySearch(); }} onClick={(event) => event.stopPropagation()}>
          <Input size="small" aria-label="搜索记录" value={recordFlow?.searchInput ?? ''} placeholder="搜索记录" onChange={(event) => recordFlow?.setSearchInput(event.target.value)} maxLength={120}/>
          <Button size="small" htmlType="submit">查询</Button>
          <Button size="small" title="重新读取" onClick={() => recordFlow?.retry()}>↻</Button>
        </form>
        {(recordFlow?.filterOptions.length || recordFlow?.sortField || recordFlow?.canCreate || recordFlow?.canDelete) ? <div className="pa-studio-record-actions" onClick={(event) => event.stopPropagation()}>
          {recordFlow.filterOptions.length ? <Select size="small" aria-label="筛选状态" style={{ minWidth: 95 }} value={recordFlow.filter || '__all__'} options={[{ label: '全部状态', value: '__all__' }, ...recordFlow.filterOptions.map((value) => ({ label: value, value }))]} onChange={(value) => recordFlow.setFilter(value === '__all__' ? '' : value)}/> : null}
          {recordFlow.sortField ? <Select size="small" aria-label="排序方式" style={{ minWidth: 106 }} value={recordFlow.direction || 'none'} options={[{ value: 'none', label: '默认顺序' }, { value: 'asc', label: '升序 ↑' }, { value: 'desc', label: '降序 ↓' }]} onChange={(value: 'none' | 'asc' | 'desc') => recordFlow.setDirection(value === 'none' ? '' : value)}/> : null}
          {recordFlow.canCreate ? <Button size="small" type="primary" onClick={() => { setCreateTitle(''); setCreateOpen(true); }}>＋新增</Button> : null}
          {recordFlow.canDelete ? <Popconfirm title="确定删除选中的记录？" description="这会向后端发送真实 DELETE 请求，无法通过设计器撤销。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void recordFlow.remove().then(() => message.success('已删除并刷新列表')).catch((reason: unknown) => message.error(reason instanceof Error ? reason.message : '删除失败'))}><Button size="small" danger disabled={!recordFlow.selected || recordFlow.saving}>删除选中</Button></Popconfirm> : null}
          <Modal title="新增记录" open={createOpen} okText="提交到后端" cancelText="取消" confirmLoading={submitting} onCancel={() => setCreateOpen(false)} onOk={() => { setSubmitting(true); void recordFlow.create(createTitle).then(() => { setCreateOpen(false); void message.success('已创建并刷新列表'); }).catch((reason: unknown) => { void message.error(reason instanceof Error ? reason.message : '新增失败'); }).finally(() => setSubmitting(false)); }}><label className="pa-studio-setting"><span>记录标题</span><Input value={createTitle} maxLength={120} placeholder="至少两个字符" onChange={(event) => setCreateTitle(event.target.value)}/></label></Modal>
        </div> : null}
        {recordFlow?.status === 'loading' ? <div role="status" className="pa-studio-record-hint">正在加载记录…</div> : recordFlow?.status === 'error' ? <div role="alert" className="pa-studio-record-error">{recordFlow.error}<Button size="small" onClick={() => recordFlow.retry()}>重试</Button></div> : recordFlow?.visibleRows.length ? <div className="pa-studio-record-rows">{recordFlow.visibleRows.map((row) => {
          const key = recordId(row, recordFlow.idField);
          return <button type="button" key={key} className={key === recordFlow.selectedId ? 'active' : ''} aria-pressed={key === recordFlow.selectedId} onClick={(event) => { event.stopPropagation(); recordFlow.select(row); }}><span>{recordText(row[recordFlow.labelField]) || key}</span><small>{key}</small></button>;
        })}</div> : <div className="pa-studio-record-hint">暂无记录</div>}
      </>}
      {live && recordFlow?.detailStatus === 'loading' ? <div role="status" className="pa-studio-record-hint">正在读取选中记录的详情…</div> : null}
      {live && recordFlow?.detailStatus === 'error' ? <div role="alert" className="pa-studio-record-error">详情读取失败：{recordFlow.detailError}</div> : null}
      {live && recordFlow && recordFlow.saveStatus === 'error' ? <div role="alert" className="pa-studio-record-error">保存失败：{recordFlow.saveError}</div> : null}
      {live && recordFlow && recordFlow.saveStatus === 'success' ? <div role="status" className="pa-studio-record-hint">保存成功，列表已刷新。</div> : null}
      {live && recordFlow && recordFlow.totalPages > 1 ? <div className="pa-studio-record-pager"><Button size="small" disabled={recordFlow.page === 1} onClick={(event) => { event.stopPropagation(); recordFlow.changePage(recordFlow.page - 1); }}>上一页</Button><span>{recordFlow.page} / {recordFlow.totalPages} · 共 {recordFlow.totalRows} 条</span><Button size="small" disabled={recordFlow.page >= recordFlow.totalPages} onClick={(event) => { event.stopPropagation(); recordFlow.changePage(recordFlow.page + 1); }}>下一页</Button></div> : null}
    </div>;
  } else if (node.type === 'placeholder' && decoration.widgetKind) {
    const widgetProps = decoration.widgetProps ?? {};
    const sourceKey = typeof widgetProps.sourceId === 'string' ? widgetProps.sourceId : '';
    const linkedSource = sourceKey ? dataSources?.find((entry) => entry.id === sourceKey) : undefined;
    const resolvedProps = sourceKey ? { ...widgetProps, submitUrl: linkedSource?.saveUrl ?? '' } : widgetProps;
    visual = <WidgetPreview kind={decoration.widgetKind} props={resolvedProps} live={live}
      recordSelection={recordFlow ? { selectedId: recordFlow.selectedId, selected: recordFlow.selected, detailStatus: recordFlow.detailStatus } : undefined} workflowPages={workflowPages} onWorkflowNavigate={onNavigate}/>;
  } else {
    visual = <div className="pa-studio-placeholder"><strong>{text(props.title, '内容区域')}</strong><small>{text(props.description, '可以继续完善内容')}</small></div>;
  }
  const geometry = decoration.geometry;
  const wrapperStyle: CSSProperties = {
    ...(node.placement?.span ? { gridColumn: `span ${node.placement.span}` } : {}),
    ...(geometry?.width ? { width: geometry.width, ...(geometry.mode === 'absolute' ? {} : { maxWidth: '100%' }) } : {}),
    ...(geometry?.height ? { height: geometry.height, minHeight: geometry.height } : {}),
    ...(geometry?.mode === 'absolute' ? { position: 'absolute', left: geometry.x ?? 0, top: geometry.y ?? 0 } :
      geometry?.x || geometry?.y ? { translate: `${geometry.x ?? 0}px ${geometry.y ?? 0}px` } : {})
  };
  const surface = <div
    className={`pa-studio-node atlas-fx ${selected ? 'is-selected' : ''} ${editable ? 'is-editable' : ''} ${active ? 'atlas-active' : ''} ${node.kind === 'layout' ? 'is-layout' : ''} ${geometry?.mode === 'absolute' ? 'is-absolute' : ''}`}
    data-node-type={node.type} data-effect={effect || undefined} data-studio-node={node.id} data-studio-component={node.id}
    style={wrapperStyle}
    onClick={select}
    onPointerMove={pointer}
    onPointerLeave={(event) => { if (effect === 'tilt') { event.currentTarget.style.removeProperty('--atlas-rotate-x'); event.currentTarget.style.removeProperty('--atlas-rotate-y'); } }}
    onDragOver={accept}
    onDrop={(event) => { if (canDropInto) report(event, 'inside'); else report(event, 'after'); }}
    {...(editable ? { tabIndex: 0, role: 'group' as const, 'aria-label': `${nodeLabel(node)}，点击选择`, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); onSelect?.(node.id); } } } : live && node.kind === 'widget' && node.type !== 'button' && clickableEffects.has(effect) ? { tabIndex: 0, role: 'button' as const, 'aria-label': `${nodeLabel(node)}，切换效果`, 'aria-pressed': active, onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); setActive((previous) => !previous); } } } : {})}
  >
    {editable && depth > 0 ? <div className="pa-studio-between" onDragOver={accept} onDrop={(event) => report(event, 'before')}/> : null}
    {editable ? <div className="pa-studio-node-handle" draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('application/x-atlas-node', node.id); event.dataTransfer.effectAllowed = 'move'; }} title="拖动调整位置" aria-label="拖动组件">⠿<span>{nodeLabel(node)}</span></div> : null}
    {visual}
    {editable && depth > 0 ? <div className="pa-studio-between after" onDragOver={accept} onDrop={(event) => report(event, 'after')}/> : null}
  </div>;
  // Portals retain React context and selection events. Coordinates are measured
  // from the PAGE content origin, even for nodes nested in a grid or panel.
  return geometry?.mode === 'absolute' && depth > 0 && absoluteLayer
    ? createPortal(surface, absoluteLayer)
    : surface;
}
