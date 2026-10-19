import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type CSSProperties } from 'react';
import { Button, Input, InputNumber, Popconfirm, Modal, Radio, Segmented, Select, Space, Switch, Tag, message } from 'antd';
import { Link } from 'react-router';
import { Page, PageContent } from '@foundation/ui';
import type { CompositionNode } from '../bridge';
import { buildProjectBlueprint, type PageTemplate } from '../builder/project-blueprint';
import { accentChoices, designCssVariables, type DesignConfig } from '../effects/config';
import { effectCategories, effects } from '../effects/catalog';
import { StudioCanvas } from './StudioCanvas';
import { NativeAasRecoveryPanel } from './NativeAasRecoveryPanel';
import { WorkflowGraph } from './WorkflowGraph';
import { useStudioRecordFlow } from './StudioRecords';
import { addRecordEditorExample, addLinkedRecordExample } from './record-template';
import { countDataSourceUses, detailRequestUrl, mergeRecordDetail, newDemoSource, newServerDemoSource, validDetailTemplate, type StudioDataSource } from './data-sources';
import { buildStudioListUrl, readStudioListPayload, validQueryParameter, type StudioFieldMapping } from './source-query';
import { validRecordField, validRecordPath, validRecordUrl, type StudioRecordFieldBinding, type StudioRecordListBinding, type StudioRecordSubmitBinding } from './record-bindings';
import { studioEffectStyles } from './effect-styles';
import { appendWorkflowTrace, defaultWorkflowStep, type WorkflowActionStep, type WorkflowStep, type WorkflowStepType, type WorkflowTrace } from './studio-workflows';
import { studioWidgetKinds, widgetDefinition, normalizeWidgetProps, type StudioWidgetKind, type OverlayRecordSelection } from './widgets';
import { displayApiValue, requestStudioApi, validApiUrl, validResponsePath, type StudioApiBinding } from './api';
import { projectExportFiles, zipTextFiles } from './exporter';
import { walkNodes, backupStudioDocument, clearStudioBackup, createNode, editNode, editPageDocument, findNode, firstPageId, freshNodeId, insertKinds, insertNode, mayContain, moveNode, nodeLabel, normalizeGeometry, paletteGroups, parentOf, parseStudioFile, readStudioBackup, readStudioDocument, removeStudioComponent, removeStudioPage, saveStudioDocument, setDecoration, takeStudioHandoff, type InsertKind, type StudioDecoration, type StudioDocument, type StudioInteraction, type StudioPattern, type StudioGeometry, type StudioNavigation } from './model';
import './studio.css';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a'); element.href = url; element.download = filename; document.body.appendChild(element); element.click(); element.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const patternOptions: { value: StudioPattern; label: string; note: string }[] = [
  { value: 'default', label: '默认排列', note: '沿用当前组件结构' },
  { value: 'bento', label: 'Bento 重点网格', note: '突出首个模块，适合数据概览' },
  { value: 'kanban', label: '看板分列', note: '将子模块排列为并列工作区' },
  { value: 'timeline', label: '时间轴', note: '将多项内容沿时间线排列' },
  { value: 'accordion', label: '折叠视觉', note: '预览视觉分组，完整折叠逻辑需业务接入' }
];
const standardKinds = new Set<string>(insertKinds);
const typeLabels: Record<string, string> = { records: '记录列表', stack: '排列', grid: '网格', split: '分栏', tabs: '标签', panel: '卡片', text: '文字', metric: '指标', button: '按钮', input: '输入', select: '选择', placeholder: '占位' }; 
const inspectorSections = [{ id: '页面', icon: '▤' }, { id: '内容', icon: '≡' }, { id: '位置', icon: '⊞' }, { id: '形式', icon: '▦' }, { id: '交互', icon: '↪' }, { id: '特效', icon: '✧' }, { id: '组件数据', icon: '⇄' }, { id: '接口管理', icon: '⌁' }, { id: '流程', icon: '⤳' }, { id: '风格', icon: '◈' }] as const;
const labels: Record<string, string> = { title: '标题', text: '文字', label: '名称', value: '指标数值', suffix: '数值单位', placeholder: '占位提示', description: '补充说明', defaultValue: '默认值' };

function Outline({ node, selectedId, onSelect, onDelete, decorations, pageId, level = 0 }: {
  node: CompositionNode; selectedId: string; onSelect: (id: string) => void; onDelete: (id: string) => void;
  decorations: StudioDocument['decorations']; pageId: string; level?: number;
}) {
  const kind = (decorations[`${pageId}:${node.id}`] ?? decorations[node.id])?.widgetKind;
  return <>
    <div className="pa-studio-layer-row">
      <button className={`pa-studio-layer ${node.id === selectedId ? 'is-selected' : ''}`} style={{ paddingLeft: 9 + level * 13 }} type="button" onClick={() => onSelect(node.id)}><span aria-hidden="true">{node.kind === 'layout' ? '▦' : '▫'}</span><span>{nodeLabel(node)}</span><small>{kind ? widgetDefinition(kind).label : typeLabels[node.type] ?? node.type}</small></button>
      {level > 0 ? <Popconfirm title={`删除「${nodeLabel(node)}」及其子组件？`} onConfirm={() => onDelete(node.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}><button type="button" className="pa-studio-layer-delete" title="删除组件" aria-label={`删除组件 ${nodeLabel(node)}`}>×</button></Popconfirm> : null}
    </div>
    {(node.children ?? []).map((child) => <Outline key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} decorations={decorations} pageId={pageId} level={level + 1}/>) }
  </>;
}
function TextSetting({ title, value, change, multiline = false }: { title: string; value: string; change: (value: string) => void; multiline?: boolean }) {
  return <label className="pa-studio-setting"><span>{title}</span>{multiline ? <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={240} value={value} onChange={(event) => change(event.target.value)}/> : <Input maxLength={120} value={value} onChange={(event) => change(event.target.value)}/>}</label>;
}
function SettingSelect({ title, value, options, onChange }: { title: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <label className="pa-studio-setting"><span>{title}</span><Select value={value} options={options} onChange={onChange} style={{ width: '100%' }}/></label>;
}

export function Component() {
  const [doc, setDoc] = useState<StudioDocument>(readStudioDocument);
  const [pageId, setPageId] = useState(() => firstPageId(doc.blueprint));
  const [absoluteLayer, setAbsoluteLayer] = useState<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState(() => doc.blueprint.pages[0]?.composition?.id ?? '');
  const [tableSelection, setTableSelection] = useState<OverlayRecordSelection | null>(null);
  useEffect(() => { setTableSelection(null); }, [pageId]);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [live, setLive] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [inspector, setInspector] = useState('内容');
  const [paletteSearch, setPaletteSearch] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [workflowTraces, setWorkflowTraces] = useState<WorkflowTrace[]>([]);
  const [apiTestResult, setApiTestResult] = useState('');
  const [sourceTestResult, setSourceTestResult] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [saved, setSaved] = useState('');
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageId, setNewPageId] = useState('new-page');
  const [newPageTitle, setNewPageTitle] = useState('新业务页面');
  const [newPageTemplate, setNewPageTemplate] = useState<PageTemplate>('blank');
  const [hasBackup, setHasBackup] = useState(() => Boolean(readStudioBackup()));
  const history = useRef<StudioDocument[]>([]);
  const future = useRef<StudioDocument[]>([]);
  const imported = useRef<HTMLInputElement>(null);
  const [notice, noticeElement] = message.useMessage();
  const page = doc.blueprint.pages.find((entry) => entry.id === pageId) ?? doc.blueprint.pages[0];
  const root = page?.composition;
  const recordFlow = useStudioRecordFlow(root, doc.decorations, page?.id ?? '', live, doc.dataSources);
  const source = doc.dataSources.find((entry) => entry.id === sourceId) ?? doc.dataSources[0];
  const existingListId = useMemo(() => {
    let source = '';
    walkNodes(root, (node) => {
      if (node.type === 'placeholder' && (doc.decorations[`${page?.id}:${node.id}`] ?? doc.decorations[node.id])?.recordList) source ||= node.id;
    });
    return source;
  }, [root, doc.decorations, page?.id]);
  const chosen = findNode(root, selectedId) ?? root;
  const metaKey = `${page?.id ?? ''}:${chosen?.id ?? ''}`;
  const meta = doc.decorations[metaKey] ?? (chosen ? doc.decorations[chosen.id] : undefined) ?? {};
  const richProps = meta.widgetKind ? normalizeWidgetProps(meta.widgetKind, meta.widgetProps) : {};
  const filteredPalette = paletteGroups.map((group) => ({ ...group, nodes: group.nodes.filter((entry) => `${group.title} ${entry.label} ${entry.type}`.toLowerCase().includes(paletteSearch.trim().toLowerCase())) })).filter((group) => group.nodes.length > 0);
  const orderedNavigation = useMemo(() => {
    const entries = [...(doc.blueprint.navigation?.items ?? [])].sort((a, b) => a.order - b.order);
    return entries.map((entry) => ({ ...entry, page: doc.blueprint.pages.find((item) => item.id === entry.target) })).filter((entry) => Boolean(entry.page));
  }, [doc.blueprint]);
  const cssVars = useMemo(() => ({ ...designCssVariables(doc.design), '--atlas-surface': doc.design.surface === 'dark' ? '#15251f' : '#ffffff', '--atlas-panel': doc.design.surface === 'dark' ? '#203930' : '#ffffff', '--atlas-ink': doc.design.surface === 'dark' ? '#edf8f0' : '#233a2d' }) as CSSProperties, [doc.design]);

  // Consume the one-time handoff in an effect, not inside a StrictMode-rendered initializer.
  useEffect(() => {
    const incoming = takeStudioHandoff();
    if (!incoming) return;
    setDoc(incoming);
    setPageId(firstPageId(incoming.blueprint));
    setSelectedId(incoming.blueprint.pages[0]?.composition?.id ?? '');
    setHasBackup(Boolean(readStudioBackup()));
  }, []);
  useEffect(() => { setSaved(saveStudioDocument(doc) ? '已保存到本机' : '自动保存不可用，请导出备份'); }, [doc]);
  useEffect(() => { if (!doc.blueprint.pages.some((item) => item.id === pageId)) setPageId(firstPageId(doc.blueprint)); }, [doc.blueprint.pages, pageId]);
  useEffect(() => { if (root && !findNode(root, selectedId)) setSelectedId(root.id); }, [root, selectedId]);
  useEffect(() => { setApiTestResult(''); }, [metaKey]);
  const commit = (next: StudioDocument) => {
    history.current = [...history.current.slice(-39), doc];
    future.current = [];
    setDoc(next);
  };
  const updateDesign = <K extends keyof DesignConfig>(key: K, value: DesignConfig[K]) => commit({ ...doc, design: { ...doc.design, [key]: value } });
  const renameProject = (nextName: string) => {
    if (!nextName.trim() || nextName.length > 100) return;
    commit({ ...doc, blueprint: { ...doc.blueprint, project: { ...doc.blueprint.project, title: nextName } } });
  };
  const renamePage = (nextName: string) => {
    if (!page || !nextName.trim() || nextName.length > 100) return;
    const copy = structuredClone(doc);
    const entry = copy.blueprint.pages.find((item) => item.id === page.id);
    if (entry) entry.title = nextName;
    const navigation = copy.blueprint.navigation.items.find((item) => item.target === page.id);
    if (navigation) navigation.label = nextName;
    commit(copy);
  };
  const addPage = () => {
    try {
      const updated = buildProjectBlueprint({
        mode: 'existing', projectId: doc.blueprint.project.id, projectTitle: doc.blueprint.project.title,
        pageId: newPageId, pageTitle: newPageTitle, template: newPageTemplate, existingBlueprint: doc.blueprint
      });
      commit({ ...doc, blueprint: updated });
      setPageId(newPageId);
      setSelectedId(updated.pages.find((item) => item.id === newPageId)?.composition?.id ?? '');
      setNewPageOpen(false);
      void notice.success('新页面已加入项目。');
    } catch (error) { void notice.error(error instanceof Error ? error.message : '无法添加页面'); }
  };
  const addThreeApiExample = () => {
    try {
      const result = addLinkedRecordExample(doc);
      commit(result.document);
      setSourceId(result.sourceId);
      setPageId(result.pageId);
      setSelectedId('recordList');
      setInspector('接口管理'); setInspectorOpen(true); setLive(false);
      void notice.success('已创建列表、详情、保存三接口联动示例。');
    } catch (error) { void notice.error(error instanceof Error ? error.message : '无法创建示例页'); }
  };
  const addLinkedExample = () => {
    try {
      const result = addRecordEditorExample(doc);
      commit(result.document);
      setPageId(result.pageId);
      setSelectedId('recordList');
      setInspector('组件数据');
      setInspectorOpen(true);
      setLive(false);
      void notice.success('已创建记录编辑页面，可切换到体验模式操作。');
    } catch (error) { void notice.error(error instanceof Error ? error.message : '无法创建数据联动示例'); }
  };
  const rollback = () => {
    const previous = history.current.pop(); if (!previous) return;
    future.current.push(doc); setDoc(previous);
  };
  const redo = () => {
    const next = future.current.pop(); if (!next) return;
    history.current.push(doc); setDoc(next);
  };
  const editTree = (fn: (root: CompositionNode) => CompositionNode) => {
    if (!page) return;
    try { commit(editPageDocument(doc, page.id, fn)); }
    catch (error) { void notice.warning(error instanceof Error ? error.message : '无法更新布局'); }
  };
  const updateNode = (id: string, fn: (node: CompositionNode) => void) => editTree((tree) => editNode(tree, id, fn));
  const updateMeta = (patch: Partial<StudioDecoration>) => { if (chosen) commit(setDecoration(doc, metaKey, patch)); };
  const updateGeometry = (field: keyof StudioGeometry, value: number | null) => {
    const geometry = { ...meta.geometry };
    if (field === 'mode') return;
    // For untouched/new components, entering X/Y immediately selects page-based
    // absolute coordinates. Existing relative offsets remain unchanged until
    // the user explicitly switches their mode.
    const legacyOffset = !geometry.mode && (Boolean(geometry.x) || Boolean(geometry.y));
    if ((field === 'x' || field === 'y') && !legacyOffset) geometry.mode = 'absolute';
    if (value === null) delete geometry[field]; else geometry[field] = value;
    updateMeta({ geometry: normalizeGeometry(geometry) });
  };
  const updateGeometryMode = (absolute: boolean) => {
    updateMeta({ geometry: absolute ? normalizeGeometry({ ...meta.geometry, mode: 'absolute', x: meta.geometry?.mode === 'absolute' ? (meta.geometry.x ?? 0) : 0, y: meta.geometry?.mode === 'absolute' ? (meta.geometry.y ?? 0) : 0 }) : normalizeGeometry({ width: meta.geometry?.width, height: meta.geometry?.height }) });
  };
  const updateApi = (patch: Partial<StudioApiBinding>) => {
    if (!chosen) return;
    const method = chosen.type === 'button' ? 'POST' : 'GET';
    updateMeta({ api: { method, url: '', ...meta.api, ...patch } });
    setApiTestResult('');
  };
  const updateRecordList = (patch: Partial<StudioRecordListBinding>) => updateMeta({ recordList: { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title', ...meta.recordList, ...patch } });
  const updateRecordField = (patch: Partial<StudioRecordFieldBinding>) => updateMeta({ recordField: { field: 'title', ...meta.recordField, ...patch } });
  const updateRecordSubmit = (patch: Partial<StudioRecordSubmitBinding>) => updateMeta({ recordSubmit: { url: '/api/studio-records', includeId: true, ...meta.recordSubmit, ...patch } });
  const testApi = async () => {
    if (!meta.api || !validApiUrl(meta.api.url)) { void notice.warning('请先输入有效的接口地址'); return; }
    setApiTestResult('请求中…');
    try { const result = await requestStudioApi(meta.api); setApiTestResult(`请求成功：${displayApiValue(result)}`); void notice.success('请求成功'); }
    catch (error) { const detail = error instanceof Error ? error.message : '请求失败'; setApiTestResult(detail); void notice.error(detail); }
  };
  const addSource = () => {
    if (doc.dataSources.length >= 25) { void notice.warning('每个项目最多管理 25 个数据源'); return; }
    let id = 'data-source'; let index = 2;
    while (doc.dataSources.some((item) => item.id === id)) id = `data-source-${index++}`;
    commit({ ...doc, dataSources: [...doc.dataSources, { ...newDemoSource(id), name: `数据源 ${doc.dataSources.length + 1}`, listUrl: '', detailUrl: '', saveUrl: '', detailPath: '' }] });
    setSourceId(id); setSourceTestResult(''); setInspector('接口管理'); setInspectorOpen(true);
  };
  const updateSource = (patch: Partial<StudioDataSource>) => {
    if (!source) return;
    commit({ ...doc, dataSources: doc.dataSources.map((item) => item.id === source.id ? { ...item, ...patch } : item) });
    setSourceTestResult('');
  };
  const deleteSource = (id: string) => {
    const used = countDataSourceUses(id, doc.decorations);
    if (used) { void notice.warning(`此数据源已绑定 ${used} 个组件，请先在「数据」中解除绑定。`); return; }
    commit({ ...doc, dataSources: doc.dataSources.filter((item) => item.id !== id) });
    setSourceId(''); setSourceTestResult(''); void notice.success('数据源已删除，可撤销。');
  };
  const connectCurrentPage = () => {
    if (!page || !source) return;
    let next = doc;
    let count = 0;
    walkNodes(root, (node) => {
      const key = `${page.id}:${node.id}`;
      const meta = next.decorations[key] ?? next.decorations[node.id];
      if (meta?.recordList) { next = setDecoration(next, key, { recordList: { ...meta.recordList, sourceId: source.id } }); count += 1; }
      if (meta?.recordSubmit) { next = setDecoration(next, key, { recordSubmit: { ...meta.recordSubmit, sourceId: source.id } }); count += 1; }
    });
    if (!count) { void notice.warning('本页面还没有记录列表或保存按钮。可以先创建联动示例页。'); return; }
    commit(next); void notice.success(`已为本页 ${count} 个组件绑定共享数据源。`);
  };
  const testSource = async () => {
    if (!source?.listUrl || !validRecordUrl(source.listUrl)) { void notice.warning('请配置有效的列表 GET 地址'); return; }
    setSourceTestResult('正在读取列表…');
    try {
      const data = await requestStudioApi({ method: 'GET', url: buildStudioListUrl({ ...source, url: source.listUrl }, 1, '') });
      const { rows, total } = readStudioListPayload(data, { ...source, url: source.listUrl });
      let summary = `列表读取成功：本页 ${rows.length} 条 / 总计 ${total} 条`;
      if (source.detailUrl && rows[0]) {
        const id = String(rows[0][source.idField]);
        const detail = await requestStudioApi({ method: 'GET', url: detailRequestUrl(source.detailUrl, id), ...(source.detailPath ? { responsePath: source.detailPath } : {}) });
        const result = mergeRecordDetail(rows[0], detail, source.idField, id, source.fieldMappings);
        summary += `；详情读取成功，字段：${Object.keys(result).slice(0, 12).join('、')}`;
      }
      setSourceTestResult(summary);
      void notice.success('GET 接口测试通过');
    } catch (error) { const msg = error instanceof Error ? error.message : '接口读取失败'; setSourceTestResult(msg); void notice.error(msg); }
  };
  const changeFieldMapping = (index: number, patch: Partial<StudioFieldMapping>) => {
    if (!source) return;
    updateSource({ fieldMappings: (source.fieldMappings ?? []).map((value, position) => position === index ? { ...value, ...patch } : value) });
  };
  const addFieldMapping = () => {
    if (!source || (source.fieldMappings?.length ?? 0) >= 24) return;
    const used = new Set((source.fieldMappings ?? []).map((value) => value.field));
    const candidate = ['id', 'title', 'status', 'owner'].find((name) => !used.has(name));
    let counter = 1;
    while (!candidate && used.has(`field${counter}`)) counter++;
    const field = candidate ?? `field${counter}`;
    updateSource({ fieldMappings: [...(source.fieldMappings ?? []), { field, responsePath: field, saveField: field }] });
  };
  const updateShell = (field: 'navigation' | 'sidebarWidth', value: StudioNavigation | number) => {
    commit({ ...doc, shell: { ...doc.shell, [field]: value } });
  };
  const reorderNavigation = (index: number, step: number) => {
    const items = [...orderedNavigation];
    const other = index + step;
    if (other < 0 || other >= items.length) return;
    [items[index], items[other]] = [items[other]!, items[index]!];
    const copy = structuredClone(doc);
    const previous = copy.blueprint.navigation.items;
    const orderLookup = new Map(items.map((item, position) => [item.target, position * 10]));
    copy.blueprint.navigation.items = previous.map((item) => ({ ...item, order: orderLookup.get(item.target) ?? item.order }));
    commit(copy);
  };
  const deletePage = (targetId: string) => {
    try {
      const next = removeStudioPage(doc, targetId);
      commit(next);
      if (pageId === targetId) {
        const first = firstPageId(next.blueprint);
        setPageId(first);
        setSelectedId(next.blueprint.pages.find((entry) => entry.id === first)?.composition?.id ?? '');
      }
      void notice.success('页面及对应目录已删除，可使用撤销恢复。');
    } catch (error) { void notice.warning(error instanceof Error ? error.message : '删除页面失败'); }
  };
  const selectPage = (id: string) => { setTableSelection(null); setPageId(id); setSelectedId(doc.blueprint.pages.find((item) => item.id === id)?.composition?.id ?? ''); setReplayKey((key) => key + 1); };
  const append = (type: InsertKind, target?: string, where: 'inside' | 'before' | 'after' = 'inside') => {
    if (!root) return;
    if (type === 'records' && existingListId) { void notice.warning('每个页面目前只能配置一个记录列表。'); setSelectedId(existingListId); setInspector('组件数据'); return; }
    const inferredPlacement = target ? { targetId: target, where } : chosen && mayContain(chosen) ? { targetId: chosen.id, where: 'inside' as const } : chosen && parentOf(root, chosen.id)?.parent.type !== 'split' && parentOf(root, chosen.id) ? { targetId: chosen.id, where: 'after' as const } : { targetId: root.id, where: 'inside' as const };
    const id = freshNodeId(root, type);
    try {
      const updated = editPageDocument(doc, page!.id, (tree) => insertNode(tree, inferredPlacement.targetId, createNode(type, id), inferredPlacement.where));
      const next = type === 'records' ? setDecoration(updated, `${page!.id}:${id}`, { recordList: { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title' } }) : studioWidgetKinds.has(type as StudioWidgetKind) ? setDecoration(updated, `${page!.id}:${id}`, { widgetKind: type as StudioWidgetKind, widgetProps: normalizeWidgetProps(type as StudioWidgetKind, undefined) }) : updated;
      commit(next);
      setSelectedId(id);
    } catch (error) { void notice.warning(error instanceof Error ? error.message : '无法添加组件'); }
  };
  const drop = (targetId: string, where: 'inside' | 'before' | 'after', event: DragEvent<HTMLElement>) => {
    const type = event.dataTransfer.getData('application/x-atlas-palette');
    const dragged = event.dataTransfer.getData('application/x-atlas-node');
    if (type && standardKinds.has(type)) append(type as InsertKind, targetId, where);
    else if (dragged) { editTree((tree) => moveNode(tree, dragged, targetId, where)); setSelectedId(dragged); }
  };
  const deleteComponent = (id: string) => {
    if (!root || !page) return;
    if (id === root.id) { void notice.warning('根布局不能删除；可删除其中的组件或删除整页。'); return; }
    try { commit(removeStudioComponent(doc, page.id, id)); setSelectedId(root.id); void notice.success('组件已删除，可使用撤销恢复。'); }
    catch (error) { void notice.warning(error instanceof Error ? error.message : '删除组件失败'); }
  };
  const deleteSelected = () => { if (chosen) deleteComponent(chosen.id); };
  const shift = (offset: number) => {
    if (!root || !chosen) return;
    const location = parentOf(root, chosen.id);
    if (!location) return;
    const sibling = location.parent.children?.[location.index + offset];
    if (sibling) editTree((tree) => moveNode(tree, chosen.id, sibling.id, offset < 0 ? 'before' : 'after'));
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('文件不能超过 1 MB。');
      const incoming = parseStudioFile(await file.text());
      setHasBackup(backupStudioDocument(doc));
      history.current = []; future.current = [];
      setDoc(incoming); setPageId(firstPageId(incoming.blueprint)); setSelectedId(incoming.blueprint.pages[0]?.composition?.id ?? '');
      void notice.success('项目已载入，可以继续编辑。');
    } catch (error) { void notice.error(error instanceof Error ? error.message : '项目文件无效'); }
  };
  const exportZip = () => {
    try {
      const blob = zipTextFiles(projectExportFiles(doc));
      download(blob, `${doc.blueprint.project.id}-frontend.zip`);
      void notice.success('已导出项目源码与设计文件。');
    } catch (error) { void notice.error(error instanceof Error ? error.message : '导出失败'); }
  };
  const restoreBackup = () => {
    const backup = readStudioBackup();
    if (!backup) { void notice.warning('没有可以恢复的项目草稿。'); return; }
    commit(backup);
    setPageId(firstPageId(backup.blueprint));
    setSelectedId(backup.blueprint.pages[0]?.composition?.id ?? '');
    clearStudioBackup();
    setHasBackup(false);
    void notice.success('已恢复之前的草稿。');
  };
  const updateRich = (key: string, value: unknown) => { if (meta.widgetKind) updateMeta({ widgetProps: { ...richProps, [key]: value } }); };
  const edit = (key: string, value: string | number | boolean) => { if (chosen) updateNode(chosen.id, (node) => { node.props = { ...node.props, [key]: value }; }); };
  const contentTab = chosen ? <div className="pa-studio-inspector-inner">
    <div className="pa-studio-inspector-label">{nodeLabel(chosen)}<Tag>{meta.widgetKind ? widgetDefinition(meta.widgetKind).label : typeLabels[chosen.type] ?? chosen.type}</Tag></div>
    {chosen.kind === 'layout' ? <>
      <TextSetting title="布局说明" value={chosen.label ?? ''} change={(value) => updateNode(chosen.id, (node) => { if (value) node.label = value; else delete node.label; })}/>
      {chosen.type === 'grid' ? <label className="pa-studio-setting"><span>网格列数</span><InputNumber min={1} max={6} value={Number(chosen.props?.columns ?? 2)} onChange={(value) => edit('columns', value ?? 2)} style={{ width: '100%' }}/></label> : null}
      {chosen.type === 'stack' ? <SettingSelect title="排列方向" value={String(chosen.props?.direction ?? 'vertical')} options={[{ value: 'vertical', label: '纵向' }, { value: 'horizontal', label: '横向' }]} onChange={(value) => edit('direction', value)}/> : null}
      {chosen.type !== 'tabs' ? <label className="pa-studio-setting"><span>组件间距（像素）</span><InputNumber min={0} max={80} value={Number(chosen.props?.gap ?? 16)} onChange={(value) => edit('gap', value ?? 0)} style={{ width: '100%' }}/></label> : null}
      {chosen.type === 'split' ? <label className="pa-studio-setting"><span>右侧宽度</span><InputNumber min={175} max={1000} value={Number(chosen.props?.secondarySize ?? 280)} onChange={(value) => edit('secondarySize', value ?? 280)} style={{ width: '100%' }}/></label> : null}
    </> : <>
      {Object.entries(labels).filter(([key]) => !meta.widgetKind && key !== 'defaultValue' && (chosen.props?.[key] !== undefined || (chosen.type === 'text' && key === 'text'))).map(([key, label]) => <TextSetting key={`${chosen.id}-${key}`} title={label} value={String(chosen.props?.[key] ?? '')} change={(value) => edit(key, key === 'value' && typeof chosen.props?.value === 'number' ? Number(value) || 0 : value)} multiline={key === 'description' || key === 'text'}/>)}
      {chosen.type === 'button' ? <SettingSelect title="按钮样式" value={String(chosen.props?.type ?? 'default')} options={['primary', 'default', 'dashed', 'link', 'text'].map((value) => ({ value, label: ({ primary: '主要', default: '默认', dashed: '虚线', link: '链接', text: '文字' } as Record<string, string>)[value] ?? value }))} onChange={(value) => edit('type', value)}/> : null}
      {chosen.type === 'text' ? <SettingSelect title="文字层级" value={String(chosen.props?.variant ?? 'body')} options={[{ value: 'title', label: '大标题' }, { value: 'subtitle', label: '小标题' }, { value: 'body', label: '正文' }, { value: 'secondary', label: '辅助正文' }]} onChange={(value) => edit('variant', value)}/> : null}
      {chosen.type === 'input' ? <TextSetting title="输入占位文字" value={String(chosen.props?.placeholder ?? '')} change={(value) => edit('placeholder', value)}/> : null}
      {chosen.type === 'select' ? <TextSetting title="下拉选项（每行一项）" multiline value={Array.isArray(chosen.props?.options) ? chosen.props.options.map((option) => String((option as {label?:string}).label ?? '')).join('\n') : ''} change={(value) => updateNode(chosen.id, (node) => { node.props = { ...node.props, options: value.split('\n').map((label, index) => ({ label: label.trim() || `选项${index + 1}`, value: `option-${index + 1}` })) }; })}/> : null}
      {meta.widgetKind ? <>
        {['title', 'text', 'description', 'value', 'suffix', 'placeholder', 'src', 'values', 'series', 'unit', 'triggerText', 'okText', 'cancelText', 'formFields', 'tableColumns', 'filterValues'].filter((field) => richProps[field] !== undefined).map((field) => <TextSetting key={`rich-${field}`} title={({ title: '名称', text: '文字', description: '说明', value: '数值', suffix: '单位', placeholder: '占位文字', src: '图片 URL', values: '旧版单序列数值', series: '多序列（名称:1,2;名称2:3,4）', unit: '坐标单位', triggerText: '触发按钮', okText: '确认按钮', cancelText: '取消按钮', formFields: '弹窗表单字段（每行：key|标签|text/email/number|required/optional）', tableColumns: '表格列（每行：字段|标题）', filterValues: '筛选候选值（逗号分隔）' } as Record<string,string>)[field] ?? field} value={String(richProps[field] ?? '')} change={(value) => updateRich(field, value)} multiline={field === 'description' || field === 'series' || field === 'formFields' || field === 'tableColumns'}/>) }
        {richProps.items !== undefined ? <TextSetting title="条目（每行一项，表格可用「名称|状态」）" multiline value={Array.isArray(richProps.items) ? richProps.items.join('\n') : ''} change={(value) => updateRich('items', value.split('\n').slice(0, 30).map((item) => item.slice(0, 160)))}/> : null}
        {['accept','uploadUrl','statusUrl','statusPath','percentPath','dataUrl','dataPath','submitUrl','itemsPath','totalPath','detailUrl','detailPath','deleteUrl','deleteEtagField','idField','filterField','sortField'].filter((field) => richProps[field] !== undefined).map((field) => <TextSetting key={field} title={({ accept: '允许的文件类型', uploadUrl: '上传 POST 地址', statusUrl: '任务状态 GET 地址', statusPath: '响应中的状态路径', percentPath: '进度数值路径', dataUrl: '数据 GET 地址（表格或曲线）', dataPath: '曲线 JSON 数据路径（默认 data）', submitUrl: '表单提交 POST 地址', itemsPath: '表格记录路径（默认 data.items）', totalPath: '表格总数路径（默认 data.total）', detailUrl: '表格行详情 GET 地址（可选；含 {id}）', detailPath: '行详情响应路径（默认 data）', deleteUrl: '表格行删除 DELETE 地址（可选；含 {id}，删除前确认）', deleteEtagField: 'DELETE If-Match 的强 ETag 字段（可选）', idField: '唯一记录 ID 字段', filterField: '筛选字段', sortField: '可排序列字段' } as Record<string,string>)[field] ?? field} value={String(richProps[field] ?? '')} change={(value) => updateRich(field, value)}/>)}
        {meta.widgetKind === 'table' ? <>
          <SettingSelect title="共享表格数据源" value={String(richProps.sourceId ?? '')}
            options={[{value:'',label:'独立配置（兼容模式）'}, ...doc.dataSources.map((entry) => ({value:entry.id,label:entry.name}))]}
            onChange={(value) => updateRich('sourceId', value)}/>
          {richProps.sourceId ? <div className="pa-studio-note">使用项目数据源统一管理分页 GET、详情和 DELETE；数据源必须启用服务端分页。导出 ZIP 时会解析为实际 URL，缺失数据源不会回退旧接口。</div> : null}
        </> : null}
        {(meta.widgetKind === 'modal' || meta.widgetKind === 'drawer') ? <>
          <SettingSelect title="表单操作模式" value={String(richProps.formMode ?? 'create')} options={[{value:'create',label:'新增记录'},{value:'edit-selected',label:'编辑当前选中记录'}]} onChange={(value) => updateRich('formMode', value)}/>
          <SettingSelect title="保存请求方法" value={String(richProps.submitMethod ?? 'POST')} options={[{value:'POST',label:'POST'},{value:'PATCH',label:'PATCH'}]} onChange={(value) => updateRich('submitMethod',value)}/>
          <SettingSelect title="复用共享数据源（保存地址）" value={String(richProps.sourceId ?? '')} options={[{value:'',label:'直接使用下方保存地址'}, ...doc.dataSources.map((entry) => ({value:entry.id,label:entry.name}))]} onChange={(value)=>updateRich('sourceId',value)}/>
          <div className="pa-studio-note">编辑模式从当前选中记录预填，保存地址需包含一个 {'{id}'} 占位符。可直接配置地址，或选用共享数据源中的保存地址。提交时对记录 ID 编码；所选记录变化后不继续提交旧表单。</div>
        </> : null}
        {(meta.widgetKind === 'modal' || meta.widgetKind === 'drawer') ? <>
          <div className="pa-studio-note">表单工作流：先完成真正的 POST/PATCH；可分别配置成功和失败时的后续动作。复用按钮工作流引擎，支持消息、条件分支、后续 API、页面跳转和组件高亮。后续动作失败不会改写已完成的保存结果。</div>
          <Space wrap>
            <Button size="small" onClick={() => updateRich('successWorkflow', JSON.stringify({steps:[{id:'success-message',type:'notify',text:'记录已保存'},{id:'update-list',type:'refresh-records'}]},null,2))}>成功：消息与刷新</Button>
            <Button size="small" onClick={() => updateRich('successWorkflow', JSON.stringify({steps:[{id:'has-name',type:'branch',source:'draft.name',operator:'exists',expected:'',onTrue:[{id:'named',type:'notify',text:'保存 {{draft.name}} 成功'}],onFalse:[{id:'unnamed',type:'notify',text:'保存成功'}]}]},null,2))}>成功：条件分支</Button>
            <Button size="small" onClick={() => updateRich('successWorkflow', JSON.stringify({steps:[{id:'confirm-followup',type:'confirm',text:'继续执行后续接口操作？'},{id:'call-followup',type:'request',method:'POST',url:'/api/followup',body:'{}'}]},null,2))}>成功：后续 API</Button>
            <Button size="small" onClick={() => updateRich('failureWorkflow', JSON.stringify({steps:[{id:'failed',type:'notify',text:'请求失败，请检查接口或重试'}]},null,2))}>失败：提示</Button>
          </Space>
          <TextSetting title="保存成功后的步骤（JSON）" multiline value={String(richProps.successWorkflow ?? '')} change={(value)=>updateRich('successWorkflow',value)}/>
          <TextSetting title="保存失败后的步骤（JSON）" multiline value={String(richProps.failureWorkflow ?? '')} change={(value)=>updateRich('failureWorkflow',value)}/>
          <div className="pa-studio-note">每条最多 12 步；请求体和变量不会被记录在日志中。可通过 <code>{'{{draft.name}}'}</code> 引用表单值。写入型后续 API 必须先加入确认步骤。需要跳转或组件联动时，在 JSON 步骤中设置 navigate/pageId 或 emit/targetId/action。</div>
        </> : null}
        {meta.widgetKind === 'modal' || meta.widgetKind === 'drawer' ? <>
          <Button block onClick={() => updateRich('formFields', 'title|标题|text|required\nemail|邮箱|email|required\namount|金额|number|optional')}>填入三字段表单模板</Button>
          <div className="pa-studio-note">弹窗表单仅在体验模式及导出项目提交：校验必填、邮箱和数字，POST JSON；成功后触发记录列表刷新。URL 未设置时禁止实际保存，不存储密钥。</div>
        </> : null}
        {meta.widgetKind === 'drawer' ? <><SettingSelect title="抽屉位置" value={String(richProps.placement ?? 'right')} options={[{value:'right',label:'右侧'},{value:'left',label:'左侧'}]} onChange={(value) => updateRich('placement',value)}/><label className="pa-studio-setting"><span>抽屉宽度（px）</span><InputNumber min={280} max={800} value={Number(richProps.width)||420} onChange={(value) => updateRich('width',value??420)} style={{width:'100%'}}/></label></> : null}
        {['maxSizeMb','pollMs'].filter((field) => richProps[field] !== undefined).map((field) => <label key={field} className="pa-studio-setting"><span>{field === 'maxSizeMb' ? '文件大小上限（MB）' : '任务轮询间隔（ms）'}</span><InputNumber value={Number(richProps[field]) || 0} min={field === 'maxSizeMb' ? 1 : 1500} max={field === 'maxSizeMb' ? 30 : 30000} step={field === 'maxSizeMb' ? 1 : 500} onChange={(value) => updateRich(field, value)} style={{width:'100%'}}/></label>)}
        {richProps.percent !== undefined ? <label className="pa-studio-setting"><span>{meta.widgetKind === 'steps' ? '当前步骤（从 0 开始）' : '百分比'}</span><InputNumber min={0} max={meta.widgetKind === 'steps' ? 15 : 100} value={Number(richProps.percent) || 0} onChange={(value) => updateRich('percent', value ?? 0)} style={{ width: '100%' }}/></label> : null}
        {meta.widgetKind === 'file-upload' ? <Button block onClick={() => updateRich('uploadUrl', '/api/studio-upload-demo')}>填入本地上传演示地址</Button> : null}
        {meta.widgetKind === 'async-task' ? <Button block onClick={() => updateRich('statusUrl', '/api/studio-job-demo')}>填入本地任务状态演示地址</Button> : null}
        {meta.widgetKind === 'line-chart' ? <>
          <label className="pa-studio-setting"><span>自动刷新（毫秒，0 为手动）</span><InputNumber min={0} max={60000} step={5000} value={Number(richProps.refreshMs) || 0} onChange={(value) => updateRich('refreshMs', value ?? 0)} style={{width:'100%'}}/></label>
          <div className="pa-studio-note">接口返回 JSON，指定路径内使用 <code>{'{"items":["一月","二月"],"series":[{"name":"销售额","values":[-2,120]}]}'}</code> 的结构；未配置接口时继续使用上面的静态序列。仅在体验模式及导出项目中发起 GET 请求，不存储密钥。</div>
        </> : null}
        {meta.widgetKind === 'table' ? <>
          <label className="pa-studio-setting"><span>每页行数（服务端/本地）</span><InputNumber min={1} max={20} value={Number(richProps.pageSize) || 5} onChange={(value) => updateRich('pageSize', value ?? 5)} style={{ width: '100%' }}/></label>
          <div className="pa-studio-note">配置数据 GET 地址后，体验模式和独立导出才发起请求。查询参数固定为 page、pageSize、search、filterField、filter、sort 和 order，分页、搜索、筛选和排序全部交给服务端。响应示例：<code>{'{"data":{"items":[{"id":"R-1","name":"记录","status":"进行中"}],"total":1}}'}</code>。返回字段应匹配表格列配置；“选择”直接传递当前行记录至编辑弹窗，不要求同页存在记录列表；如需补充未展示的字段，可配置带 {'{id}'} 的详情 GET。</div>
        </> : null}
      </> : null}
      {chosen.label !== undefined || root?.type === 'tabs' ? <TextSetting title="标签名称" value={chosen.label ?? ''} change={(value) => updateNode(chosen.id, (node) => { node.label = value || '标签'; })}/> : null}
    </>}
    <div className="pa-studio-inspector-actions"><Button disabled={!root || chosen.id === root.id} onClick={() => shift(-1)}>↑ 上移</Button><Button disabled={!root || chosen.id === root.id} onClick={() => shift(1)}>↓ 下移</Button><Popconfirm title="删除选中的组件？" onConfirm={deleteSelected}><Button danger disabled={!root || chosen.id === root.id}>删除</Button></Popconfirm></div>
  </div> : <div>选择画布中的组件</div>;
  const interactionTab = chosen ? <div className="pa-studio-inspector-inner">
    {chosen.type === 'button' ? <>
      <SettingSelect title="点击后" value={meta.interaction ?? 'none'} options={[{ value: 'none', label: '无操作' }, { value: 'notice', label: '显示提示' }, { value: 'toggle', label: '切换状态' }, { value: 'navigate', label: '跳转到项目页面' }]} onChange={(value) => updateMeta({ interaction: value as StudioInteraction })}/>
      {meta.interaction === 'notice' ? <TextSetting title="提示内容" value={meta.feedback ?? ''} change={(value) => updateMeta({ feedback: value })}/> : null}
      {meta.interaction === 'navigate' ? <SettingSelect title="目标页面" value={meta.targetPage ?? (page?.id ?? '')} options={doc.blueprint.pages.map((entry) => ({ value: entry.id, label: entry.title }))} onChange={(value) => updateMeta({ targetPage: value })}/> : null}
      <div className="pa-studio-note">切换到「体验」模式，可点击验证。按钮行为包含在随项目导出的 React 页面中。</div>
    </> : <div className="pa-studio-note">此组件可设置视觉效果。业务交互暂支持按钮操作；复杂数据联动需要继续配置实际业务逻辑。</div>}
  </div> : null;
  const workflowSteps = meta.workflow?.steps ?? [];
  const storeWorkflow = (steps: WorkflowStep[]) => updateMeta({ workflow: steps.length ? { steps } : undefined });
  const changeWorkflowStep = (index: number, step: WorkflowStep) => storeWorkflow(workflowSteps.map((current, i) => i === index ? step : current));
  const addWorkflowStep = (type: WorkflowStepType) => {
    if (workflowSteps.length >= 12) { void notice.warning('每个按钮最多设置 12 个步骤'); return; }
    let index = workflowSteps.length + 1;
    while (workflowSteps.some((step) => step.id === `step-${index}`)) index++;
    storeWorkflow([...workflowSteps, defaultWorkflowStep(type, `step-${index}`)]);
  };
  const workflowTypes: Array<{ value: WorkflowStepType; label: string }> = [
    { value:'confirm', label:'确认操作' }, { value:'request', label:'请求后端 API' }, { value:'save-record', label:'保存当前记录' },
    { value:'refresh-records', label:'刷新记录列表' }, { value:'notify', label:'显示消息' },
    { value:'navigate', label:'切换页面' }, { value:'branch', label:'判断条件（双分支）' }, { value:'emit', label:'通知其他组件' }
  ];
  const actionTypes = workflowTypes.filter((item) => item.value !== 'branch');
  const workflowTargets: Array<{value:string;label:string}> = [];
  walkNodes(root, (node) => workflowTargets.push({value:node.id,label:`${nodeLabel(node)} · ${node.id}`}));
  const actionFields = (step: WorkflowActionStep, update: (next: WorkflowActionStep) => void) => <>
    {(step.type === 'confirm' || step.type === 'notify') ? <TextSetting title={step.type === 'confirm' ? '确认问题' : '消息内容（可使用 {{变量}}）'} value={step.text} change={(text) => update({ ...step, text })}/> : null}
    {step.type === 'request' ? <>
      <SettingSelect title="HTTP 方法" value={step.method} options={['GET','POST','DELETE'].map((value) => ({value,label:value}))} onChange={(method) => update({...step, method:method as 'GET'|'POST'|'DELETE'})}/>
      <TextSetting title="接口地址：{id} / {{results.step-2.data.id}}" value={step.url} change={(url) => update({...step,url})}/>
      {step.method === 'POST' ? <TextSetting title="JSON 请求体（字符串可引用 {{draft.title}}）" multiline value={step.body} change={(body) => update({...step,body})}/> : null}
    </> : null}
    {step.type === 'navigate' ? <SettingSelect title="目标页面" value={step.pageId} options={[{value:'',label:'请选择页面'}, ...doc.blueprint.pages.map((entry) => ({value:entry.id,label:entry.title}))]} onChange={(pageId) => update({...step,pageId})}/> : null}
    {step.type === 'emit' ? <>
      <SettingSelect title="目标组件" value={step.targetId} options={[{value:'',label:'请选择当前页面的组件'},...workflowTargets]} onChange={(targetId) => update({...step,targetId})}/>
      <SettingSelect title="组件动作" value={step.action} options={[{value:'highlight',label:'突出显示'},{value:'focus',label:'聚焦输入控件'}]} onChange={(action) => update({...step,action:action as 'highlight'|'focus'})}/>
    </> : null}
    {step.type === 'save-record' && !meta.recordSubmit ? <div className="pa-studio-workflow-foot">此按钮尚未绑定记录保存接口，请在「组件数据」中配置。</div> : null}
  </>;
  const branchChildren = (step: Extract<WorkflowStep, {type:'branch'}>, index: number, side: 'onTrue'|'onFalse') => {
    const entries = step[side];
    const update = (newItems: WorkflowActionStep[]) => changeWorkflowStep(index,{...step,[side]:newItems});
    const label = side === 'onTrue' ? '条件成立时' : '条件不成立时';
    return <div className="pa-studio-branch-side"><strong>{label}</strong>{entries.map((item, childIndex) => <div key={item.id} className="pa-studio-branch-action">
      <div className="pa-studio-workflow-step-head"><span>{childIndex+1}. {workflowTypes.find((type) => type.value === item.type)?.label}</span><Button size="small" danger onClick={() => update(entries.filter((_,i)=>i!==childIndex))}>删除</Button></div>
      <SettingSelect title="动作" value={item.type} options={actionTypes} onChange={(type) => update(entries.map((old,i)=>i===childIndex ? defaultWorkflowStep(type as WorkflowStepType,item.id) as WorkflowActionStep : old))}/>
      {actionFields(item,(next) => update(entries.map((old,i)=>i===childIndex?next:old)))}
    </div>)}
    <label className="pa-studio-setting"><span>追加{label}的动作（最多 6 步）</span><Select<WorkflowStepType | null> value={null} placeholder="选择动作" options={actionTypes} style={{width:'100%'}} disabled={entries.length>=6} onChange={(type) => {
      if (type === null) return;
      let counter = entries.length+1; while(entries.some((item)=>item.id===`${step.id}-${side}-${counter}`)) counter++;
      update([...entries,defaultWorkflowStep(type as WorkflowStepType,`${step.id}-${side}-${counter}`) as WorkflowActionStep]);
    }}/></label></div>;
  };
  const workflowTab = chosen?.type === 'button' ? <div className="pa-studio-inspector-inner">
    <div className="pa-studio-subtitle">按钮工作流</div>
    <Button block onClick={() => storeWorkflow([defaultWorkflowStep('confirm','step-1'),defaultWorkflowStep('save-record','step-2'),defaultWorkflowStep('notify','step-3')])}>套用：确认 → 保存 → 提示</Button>
    <Button block onClick={() => storeWorkflow([
      {id:'step-1',type:'request',method:'GET',url:'/api/studio-records',body:''},
      {id:'step-2',type:'branch',source:'selectedId',operator:'exists',expected:'',onTrue:[{id:'has-id',type:'notify',text:'已选择 {{selectedId}}'}],onFalse:[{id:'no-id',type:'notify',text:'请先选择记录'}]}
    ])}>套用：读取 → 条件判断</Button>
    <WorkflowGraph steps={workflowSteps} traces={workflowTraces} sourceId={chosen.id} onSelect={(index) => document.getElementById(`pa-workflow-step-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}/>
    {workflowSteps.map((step,index) => <div key={step.id} id={`pa-workflow-step-${index}`}>
      {index ? <div className="pa-studio-workflow-line"/> : null}
      <div className="pa-studio-workflow-step"><div className="pa-studio-workflow-step-head"><span>{index+1}. {workflowTypes.find((item)=>item.value===step.type)?.label}</span><Space size={2}>
        <Button size="small" disabled={index===0} onClick={()=>{const next=[...workflowSteps];[next[index-1],next[index]]=[next[index]!,next[index-1]!];storeWorkflow(next);}}>↑</Button>
        <Button size="small" disabled={index===workflowSteps.length-1} onClick={()=>{const next=[...workflowSteps];[next[index+1],next[index]]=[next[index]!,next[index+1]!];storeWorkflow(next);}}>↓</Button>
        <Button size="small" danger onClick={()=>storeWorkflow(workflowSteps.filter((_,i)=>i!==index))}>×</Button></Space></div>
      <SettingSelect title="步骤类型" value={step.type} options={workflowTypes} onChange={(type)=>changeWorkflowStep(index,defaultWorkflowStep(type as WorkflowStepType,step.id))}/>
      {step.type === 'branch' ? <>
        <TextSetting title="判断变量" value={step.source} change={(source)=>changeWorkflowStep(index,{...step,source})}/>
        <SettingSelect title="判断方式" value={step.operator} options={[{value:'exists',label:'有值'},{value:'equals',label:'等于'},{value:'not-equals',label:'不等于'},{value:'contains',label:'包含'}]} onChange={(operator)=>changeWorkflowStep(index,{...step,operator:operator as typeof step.operator})}/>
        {step.operator !== 'exists' ? <TextSetting title="比较值" value={step.expected} change={(expected)=>changeWorkflowStep(index,{...step,expected})}/> : null}
        {branchChildren(step,index,'onTrue')}{branchChildren(step,index,'onFalse')}
      </> : actionFields(step,(next)=>changeWorkflowStep(index,next))}
      </div>
    </div>)}
    <label className="pa-studio-setting"><span>追加步骤（每个按钮最多 12 步）</span><Select<WorkflowStepType | null> placeholder="选择动作" value={null} options={workflowTypes} disabled={workflowSteps.length>=12} onChange={(type)=>{ if (type !== null) addWorkflowStep(type); }} style={{width:'100%'}}/></label>
    {workflowSteps.length ? <Button block danger onClick={()=>updateMeta({workflow:undefined})}>清空工作流</Button> : null}
    <div className="pa-studio-workflow-foot">可使用 selectedId、draft.title、results.step-1.data.id 等变量。流程中的请求结果仅在本次执行期间存在。</div>
    <div className="pa-studio-workflow-log-title"><strong>最近执行记录</strong><Button size="small" onClick={()=>setWorkflowTraces([])}>清空</Button></div>
    <ol className="pa-studio-workflow-log" aria-label="工作流执行日志">{workflowTraces.slice(-30).map((entry,i)=><li key={`${entry.at}-${i}`}><span>{entry.sourceId ? `${entry.sourceId} / ` : ''}{entry.stepId}</span><span>{entry.phase}</span><time>{new Date(entry.at).toLocaleTimeString()}</time></li>)}</ol>
    {!workflowTraces.length ? <div className="pa-studio-workflow-foot">切换到「体验」并点击按钮后，这里会显示执行状态；不会保存请求体、结果或凭据。</div> : null}
  </div> : <div className="pa-studio-inspector-inner"><div className="pa-studio-note">选择按钮，即可添加条件、请求、组件事件和执行日志。</div></div>;
  const layoutTab = chosen ? <div className="pa-studio-inspector-inner">
    <div className="pa-studio-subtitle">展示形式</div>
    {chosen.kind === 'layout' ? <div className="pa-studio-pattern-options">{patternOptions.map((option) => <button key={option.value} type="button" className={(meta.pattern ?? 'default') === option.value ? 'active' : ''} onClick={() => updateMeta({ pattern: option.value })} aria-pressed={(meta.pattern ?? 'default') === option.value}><strong>{option.label}</strong><small>{option.note}</small></button>)}</div> : <div className="pa-studio-note">选中排列、网格、分栏或标签布局，再选择展示形式。</div>}
    {parentOf(root!, chosen.id)?.parent.type === 'grid' ? <label className="pa-studio-setting"><span>跨越列数</span><InputNumber min={1} max={6} value={chosen.placement?.span ?? 1} onChange={(value) => updateNode(chosen.id, (node) => { if (value) node.placement = { span: value }; else delete node.placement; })} style={{ width: '100%' }}/></label> : null}
  </div> : null;
  const effectsTab = chosen ? <div className="pa-studio-inspector-inner">
    <div className="pa-studio-effect-chooser"><button type="button" className={!meta.effect ? 'active' : ''} onClick={() => updateMeta({ effect: '' })}>无特效</button>{effectCategories.filter((item) => item.id !== 'all').map((group) => <div key={group.id}><small>{group.label}</small>{effects.filter((item) => item.category === group.id && (item.trigger !== '点击' || chosen.kind === 'widget')).map((effect) => <button type="button" key={effect.id} className={meta.effect === effect.id ? 'active' : ''} onClick={() => { updateMeta({ effect: effect.id }); setReplayKey((old) => old + 1); }}>{effect.title}<span>{effect.trigger}</span></button>)}</div>)}</div>
    {meta.effect ? <div className="pa-studio-effect-detail">{effects.find((entry) => entry.id === meta.effect)?.summary}</div> : null}
    <Button block onClick={() => setReplayKey((old) => old + 1)}>重播效果</Button>
  </div> : null;


  const positionTab = chosen ? <div className="pa-studio-inspector-inner">
    <div className="pa-studio-subtitle">位置与尺寸</div>
    <label className="pa-studio-switch-row"><span>启用绝对坐标</span><Switch checked={meta.geometry?.mode === 'absolute'} disabled={chosen.id === root?.id} onChange={updateGeometryMode}/></label>
    <div className="pa-studio-note">绝对坐标以当前页面内容区左上角为 (0, 0)，不再相对于组件原有位置偏移。尺寸与坐标单位为 px；输入新组件的 X/Y 会自动启用绝对定位；旧项目已保存的相对偏移保持原样，可手动切换。请在手机视口检查超出页面的组件。</div>
    <div className="pa-studio-dim-grid">
      {([['x', 'X · 距左边', meta.geometry?.mode === 'absolute' ? 0 : -2000, 2400], ['y', 'Y · 距上边', meta.geometry?.mode === 'absolute' ? 0 : -2000, 2400], ['width', '宽度 W', 40, 2400], ['height', '高度 H', 24, 1800]] as const).map(([field, title, min, max]) => <label key={field} className="pa-studio-setting"><span>{title}（px）</span><InputNumber value={meta.geometry?.[field] ?? null} min={min} max={max} precision={0} disabled={(field === 'x' || field === 'y') && chosen.id === root?.id} placeholder={field === 'width' || field === 'height' ? '自动' : '0'} onChange={(value) => updateGeometry(field, value)} style={{ width: '100%' }}/></label>)}
    </div>
    <Button onClick={() => updateMeta({ geometry: undefined })}>恢复自动布局</Button>
    {parentOf(root!, chosen.id)?.parent.type === 'grid' ? <label className="pa-studio-setting"><span>网格跨度（列）</span><InputNumber min={1} max={6} value={chosen.placement?.span ?? 1} onChange={(value) => updateNode(chosen.id, (node) => { if (value) node.placement = { span: value }; else delete node.placement; })} style={{ width: '100%' }}/></label> : null}
  </div> : null;
  const sourceOptions = [{ value: '__direct__', label: '独立配置（兼容模式）' }, ...doc.dataSources.map((item) => ({ value: item.id, label: item.name }))];
  const dataTab = chosen ? <div className="pa-studio-inspector-inner"><div className="pa-studio-note">这里决定<strong>当前组件</strong>显示哪些字段、如何读取数据；多个组件共用的接口地址在「接口管理」中统一维护。</div>
    {meta.widgetKind ? <div className="pa-studio-note">此组件的数据在「内容」中配置。文件上传、任务进度可在「内容」中填写专用 API 地址；其他图表暂以本地数据展示。</div> : null}
    {chosen.type === 'placeholder' && !meta.widgetKind ? <>
      <div className="pa-studio-inspector-label">记录列表 <Tag>GET</Tag></div>
      <label className="pa-studio-switch-row"><span>绑定列表数据源</span><Switch checked={Boolean(meta.recordList)} disabled={Boolean(existingListId && existingListId !== chosen.id)} onChange={(checked) => updateMeta({ recordList: checked ? { url: '/api/studio-records', itemsPath: 'data.items', idField: 'id', labelField: 'title' } : undefined })}/></label>
      {meta.recordList ? <>
        <SettingSelect title="连接到项目数据源" value={meta.recordList.sourceId ?? '__direct__'} options={sourceOptions} onChange={(value) => {
          const { sourceId: _old, ...rest } = meta.recordList!; void _old;
          updateMeta({ recordList: value === '__direct__' ? rest : { ...rest, sourceId: value } });
        }}/>
        {meta.recordList.sourceId ? <div className="pa-studio-note">{doc.dataSources.find((item) => item.id === meta.recordList?.sourceId)?.name ?? '数据源已不存在'} · 由「接口管理」统一管理列表和详情接口。<Button type="link" size="small" onClick={() => { setSourceId(meta.recordList?.sourceId ?? ''); setInspector('接口管理'); }}>编辑数据源</Button></div> : <>
        <TextSetting title="列表接口地址" value={meta.recordList.url} change={(url) => updateRecordList({ url })}/>
        <TextSetting title="数组路径" value={meta.recordList.itemsPath} change={(itemsPath) => updateRecordList({ itemsPath })}/>
        <TextSetting title="主键字段" value={meta.recordList.idField} change={(idField) => updateRecordList({ idField })}/>
        <TextSetting title="显示字段" value={meta.recordList.labelField} change={(labelField) => updateRecordList({ labelField })}/>
        <label className="pa-studio-setting"><span>每页行数（客户端）</span><InputNumber min={1} max={50} value={meta.recordList.pageSize ?? 8} onChange={(pageSize) => updateRecordList({ pageSize: pageSize ?? 8 })} style={{ width: '100%' }}/></label>
        {(!validRecordUrl(meta.recordList.url) || !validRecordPath(meta.recordList.itemsPath) || !validRecordField(meta.recordList.idField) || !validRecordField(meta.recordList.labelField)) ? <div role="alert" className="pa-studio-record-error">请检查接口 URL 和字段名称。</div> : null}
        <div className="pa-studio-note">每个页面支持一个主记录列表，选择记录后将联动表单。</div>
        </>}
      </> : null}
    </> : null}
    {['input', 'select', 'text', 'metric'].includes(chosen.type) ? <>
      <div className="pa-studio-inspector-label">选中记录的字段</div>
      <label className="pa-studio-switch-row"><span>跟随记录联动</span><Switch checked={Boolean(meta.recordField)} onChange={(checked) => updateMeta({ recordField: checked ? { field: chosen.type === 'select' ? 'status' : 'title' } : undefined })}/></label>
      {meta.recordField ? <>
        <TextSetting title="数据字段" value={meta.recordField.field} change={(field) => updateRecordField({ field })}/>
        {(chosen.type === 'input' || chosen.type === 'select') ? <>
          <label className="pa-studio-switch-row"><span>必填</span><Switch checked={Boolean(meta.recordField.required)} onChange={(required) => updateRecordField({ required })}/></label>
          {chosen.type === 'input' ? <>
            <label className="pa-studio-setting"><span>最少字符数</span><InputNumber min={0} max={200} value={meta.recordField.minLength ?? null} placeholder="不限制" onChange={(minLength) => { const { minLength: _old, ...rest } = meta.recordField!; void _old; updateMeta({ recordField: minLength === null ? rest : { ...rest, minLength } }); }} style={{ width: '100%' }}/></label>
            <label className="pa-studio-setting"><span>最多字符数</span><InputNumber min={1} max={500} value={meta.recordField.maxLength ?? null} placeholder="不限制" onChange={(maxLength) => { const { maxLength: _old, ...rest } = meta.recordField!; void _old; updateMeta({ recordField: maxLength === null ? rest : { ...rest, maxLength } }); }} style={{ width: '100%' }}/></label>
            <SettingSelect title="数据格式" value={meta.recordField.format ?? 'none'} options={[{ value: 'none', label: '不限' }, { value: 'email', label: '邮箱' }, { value: 'number', label: '数字' }]} onChange={(value) => { const { format: _old, ...rest } = meta.recordField!; void _old; updateMeta({ recordField: value === 'none' ? rest : { ...rest, format: value as 'email' | 'number' } }); }}/>
          </> : null}
        </> : null}
        {!validRecordField(meta.recordField.field) ? <div role="alert" className="pa-studio-record-error">字段名仅支持安全的英文标识符。</div> : null}
        <div className="pa-studio-note">列表中切换记录时，将按字段名填充对应组件；输入框和选择器可以修改表单草稿。</div>
      </> : null}
    </> : null}
    {chosen.type === 'button' ? <>
      <div className="pa-studio-inspector-label">保存表单 <Tag>POST</Tag></div>
      <label className="pa-studio-switch-row"><span>提交已绑定的表单字段</span><Switch checked={Boolean(meta.recordSubmit)} onChange={(checked) => updateMeta({ recordSubmit: checked ? { url: '/api/studio-records', includeId: true } : undefined })}/></label>
      {meta.recordSubmit ? <>
        <SettingSelect title="连接到项目数据源" value={meta.recordSubmit.sourceId ?? '__direct__'} options={sourceOptions} onChange={(value) => {
          const { sourceId: _old, ...rest } = meta.recordSubmit!; void _old;
          updateMeta({ recordSubmit: value === '__direct__' ? rest : { ...rest, sourceId: value } });
        }}/>
        {meta.recordSubmit.sourceId ? <div className="pa-studio-note">保存地址由项目数据源统一管理。<Button type="link" size="small" onClick={() => { setSourceId(meta.recordSubmit?.sourceId ?? ''); setInspector('接口管理'); }}>编辑数据源</Button></div> : <>
        <TextSetting title="保存接口地址" value={meta.recordSubmit.url} change={(url) => updateRecordSubmit({ url })}/>
        <label className="pa-studio-switch-row"><span>请求体包含选中记录主键</span><Switch checked={meta.recordSubmit.includeId} onChange={(includeId) => updateRecordSubmit({ includeId })}/></label>
        {!validRecordUrl(meta.recordSubmit.url) ? <div role="alert" className="pa-studio-record-error">请输入有效的保存接口地址。</div> : null}
        </>}
        <div className="pa-studio-note">只提交已绑定字段；体验模式下 POST 会先确认，成功后刷新列表。</div>
      </> : null}
    </> : null}
    {['text', 'metric', 'button'].includes(chosen.type) && !meta.recordField && !meta.recordSubmit ? <>
      <div className="pa-studio-inspector-label">独立接口 <Tag>{chosen.type === 'button' ? 'POST' : 'GET'}</Tag></div>
      <Button size="small" onClick={() => updateMeta({ api: chosen.type === 'button' ? { method: 'POST', url: '/api/studio-demo', body: '{"action":"preview"}' } : { method: 'GET', url: '/api/studio-demo', responsePath: chosen.type === 'metric' ? 'data.count' : 'data.title' } })}>填入示例接口</Button>
      <label className="pa-studio-switch-row"><span>启用接口</span><Switch checked={Boolean(meta.api)} onChange={(checked) => { updateMeta({ api: checked ? { method: chosen.type === 'button' ? 'POST' : 'GET', url: '' } : undefined }); setApiTestResult(''); }}/></label>
      {meta.api ? <>
        <label className="pa-studio-setting"><span>接口地址</span><Input maxLength={500} value={meta.api.url} placeholder="/api/dashboard/summary" {...(meta.api.url && !validApiUrl(meta.api.url) ? { status: 'error' as const } : {})} onChange={(event) => updateApi({ url: event.target.value })}/></label>
        {meta.api.method === 'GET' ? <label className="pa-studio-setting"><span>取值路径</span><Input value={meta.api.responsePath ?? ''} placeholder="data.total" {...(meta.api.responsePath && !validResponsePath(meta.api.responsePath) ? { status: 'error' as const } : {})} onChange={(event) => updateApi({ responsePath: event.target.value })}/></label> : <label className="pa-studio-setting"><span>请求体（JSON）</span><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} value={meta.api.body ?? ''} placeholder={'{"action":"save"}'} onChange={(event) => updateApi({ body: event.target.value })}/></label>}
        {meta.api.method === 'POST' ? <Popconfirm title="将真实发送 POST 请求，是否继续？" onConfirm={() => void testApi()}><Button disabled={!validApiUrl(meta.api.url)}>测试请求</Button></Popconfirm> : <Button onClick={() => void testApi()} disabled={!validApiUrl(meta.api.url)}>测试读取</Button>}
        {apiTestResult ? <div className="pa-studio-api-result" role="status">{apiTestResult}</div> : null}
      </> : null}
    </> : null}
    {chosen.type !== 'placeholder' && !['input', 'select', 'text', 'metric', 'button'].includes(chosen.type) ? <div className="pa-studio-note">选择记录列表、表单输入框、选择器或按钮以设置数据联动。</div> : null}
  </div> : null;
  const sourceTab = <div className="pa-studio-inspector-inner"><div className="pa-studio-note">接口管理相当于项目的后端连接簿：配置一次列表、详情、保存等 URL，多个组件可重复使用。具体字段显示在「组件数据」中设置。</div>
    <div className="pa-studio-source-head"><strong>项目数据源（{doc.dataSources.length}）</strong><Button size="small" onClick={addSource}>＋ 新增</Button></div>
    <details className="pa-studio-api-guide"><summary>如何连接后端接口？</summary>
      <ol><li>先用「普通接口示例」测试 GET，确认能返回记录。</li><li>替换成你后端的列表、详情和保存地址；根据真实 JSON 结果填写数组路径与字段映射。</li><li>点击「测试 GET」，再点击「绑定到本页」；切换到「体验」验证编辑与保存。</li></ol>
      <div>接口示例：<code>GET /api/tasks</code> 返回 <code>{'{"data":{"items":[{"id":"1","title":"任务"}]}}'}</code>，数组路径填写 <code>data.items</code>。</div>
      <div>后端需允许当前网页访问（同源代理或 CORS），并自行提供鉴权、权限、CSRF 防护与服务端校验。设计文件不保存密钥。</div>
    </details>
    <div className="pa-studio-source-list" aria-label="项目数据源">
      {doc.dataSources.map((entry) => <button type="button" key={entry.id} className={source?.id === entry.id ? 'active' : ''} onClick={() => { setSourceId(entry.id); setSourceTestResult(''); }}><strong>{entry.name}</strong><small>{entry.id}</small></button>)}
      {!doc.dataSources.length ? <div className="pa-studio-note">暂无项目数据源，可新增后连接到记录列表与保存按钮。</div> : null}
    </div>
    {source ? <>
      <div className="pa-studio-subtitle">{source.name}</div>
      <Space wrap size={5}>
        <Button size="small" onClick={() => { const preset = newDemoSource(source.id); updateSource({ ...preset, paginationMode: 'client', fieldMappings: [] }); }}>普通接口示例</Button>
        <Button size="small" onClick={() => updateSource(newServerDemoSource(source.id))}>分页与映射示例</Button>
      </Space>
      <TextSetting title="名称" value={source.name} change={(name) => updateSource({ name })}/>
      <div className="pa-studio-setting"><span>标识（创建后固定）</span><Input value={source.id} readOnly/></div>
      <div className="pa-studio-source-method">GET · 列表</div>
      <TextSetting title="列表接口" value={source.listUrl} change={(listUrl) => updateSource({ listUrl })}/>
      <TextSetting title="记录数组路径" value={source.itemsPath} change={(itemsPath) => updateSource({ itemsPath })}/>
      <SettingSelect title="分页方式" value={source.paginationMode ?? 'client'} options={[{ value: 'client', label: '客户端分页' }, { value: 'server', label: '服务端分页' }]} onChange={(paginationMode) => updateSource({ paginationMode: paginationMode === 'server' ? 'server' : 'client' })}/>
      {source.paginationMode === 'server' ? <>
        <TextSetting title="页码参数名" value={source.pageParam ?? 'page'} change={(pageParam) => updateSource({ pageParam })}/>
        <TextSetting title="每页条数参数名" value={source.sizeParam ?? 'pageSize'} change={(sizeParam) => updateSource({ sizeParam })}/>
        <TextSetting title="搜索参数名" value={source.searchParam ?? 'search'} change={(searchParam) => updateSource({ searchParam })}/>
        <TextSetting title="总记录数路径" value={source.totalPath ?? 'data.total'} change={(totalPath) => updateSource({ totalPath })}/>
        {([source.pageParam ?? 'page', source.sizeParam ?? 'pageSize', source.searchParam ?? 'search'].some((name) => !validQueryParameter(name)) || new Set([source.pageParam ?? 'page', source.sizeParam ?? 'pageSize', source.searchParam ?? 'search']).size !== 3 || !validRecordPath(source.totalPath ?? 'data.total')) ? <div role="alert" className="pa-studio-record-error">请求参数名不能重复，总数路径需要指向非负整数。</div> : null}
      </> : null}
      <div className="pa-studio-source-method">列表筛选与排序（可选）</div>
      <TextSetting title="筛选字段（例如 status）" value={source.filterField ?? ''} change={(filterField) => updateSource({ filterField })}/>
      {source.filterField ? <>
        <TextSetting title="可选筛选值（逗号分隔）" value={(source.filterValues ?? []).join(',')} change={(value) => updateSource({ filterValues: value.split(',').map((entry) => entry.trim()).filter(Boolean).slice(0, 15) })}/>
        {source.paginationMode === 'server' ? <TextSetting title="筛选请求参数名" value={source.filterParam ?? 'status'} change={(filterParam) => updateSource({ filterParam })}/> : null}
      </> : null}
      <TextSetting title="排序字段（例如 title）" value={source.sortField ?? ''} change={(sortField) => updateSource({ sortField })}/>
      {source.sortField && source.paginationMode === 'server' ? <div className="pa-studio-dim-grid"><TextSetting title="排序字段参数" value={source.sortParam ?? 'sortBy'} change={(sortParam) => updateSource({ sortParam })}/><TextSetting title="排序方向参数" value={source.sortDirectionParam ?? 'sortOrder'} change={(sortDirectionParam) => updateSource({ sortDirectionParam })}/></div> : null}
      <div className="pa-studio-source-method">GET · 详情（可选）</div>
      <TextSetting title="详情接口，使用 {id} 表示记录主键" value={source.detailUrl} change={(detailUrl) => updateSource({ detailUrl })}/>
      <TextSetting title="详情对象路径" value={source.detailPath} change={(detailPath) => updateSource({ detailPath })}/>
      {((source.listUrl && !validRecordUrl(source.listUrl)) || (source.detailUrl && !validDetailTemplate(source.detailUrl)) || (source.saveUrl && !validRecordUrl(source.saveUrl)) || !validRecordPath(source.itemsPath) || !validRecordPath(source.detailPath) || !validRecordField(source.idField) || !validRecordField(source.labelField)) ? <div role="alert" className="pa-studio-record-error">请检查接口地址、字段名称和取值路径。无效字段不会写入设计文件。</div> : null}
      <div className="pa-studio-source-method">POST · 保存</div>
      <TextSetting title="保存接口" value={source.saveUrl} change={(saveUrl) => updateSource({ saveUrl })}/>
      <div className="pa-studio-source-method">业务操作（可选）</div>
      <TextSetting title="POST · 新增记录地址" value={source.createUrl ?? ''} change={(createUrl) => updateSource({ createUrl })}/>
      <TextSetting title="DELETE · 删除记录地址（必须包含 {id}）" value={source.deleteUrl ?? ''} change={(deleteUrl) => updateSource({ deleteUrl })}/>
      {source.deleteUrl && !validDetailTemplate(source.deleteUrl) ? <div role="alert" className="pa-studio-record-error">删除地址需要包含一个 {'{id}'}，删除时会安全编码记录主键。</div> : null}
      <div className="pa-studio-dim-grid">
        <TextSetting title="主键字段" value={source.idField} change={(idField) => updateSource({ idField })}/>
        <TextSetting title="显示字段" value={source.labelField} change={(labelField) => updateSource({ labelField })}/>
      </div>
      <label className="pa-studio-setting"><span>每页记录数</span><InputNumber min={1} max={50} value={source.pageSize} onChange={(pageSize) => updateSource({ pageSize: pageSize ?? 8 })} style={{ width: '100%' }}/></label>
      <div className="pa-studio-source-method">字段映射</div>
      <div className="pa-studio-note">画布字段 ← 接口返回路径；保存字段为 POST 请求体中的字段名。留空表示沿用画布字段。</div>
      {(source.fieldMappings ?? []).map((mapping, index) => <div className="pa-studio-field-map" key={index}>
        <label><span>画布字段</span><Input size="small" aria-label={`映射 ${index + 1} 画布字段`} value={mapping.field} onChange={(event) => changeFieldMapping(index, { field: event.target.value })}/></label>
        <label><span>响应路径</span><Input size="small" aria-label={`映射 ${index + 1} 响应路径`} value={mapping.responsePath} onChange={(event) => changeFieldMapping(index, { responsePath: event.target.value })}/></label>
        <label><span>保存字段</span><Input size="small" aria-label={`映射 ${index + 1} 保存字段`} value={mapping.saveField} onChange={(event) => changeFieldMapping(index, { saveField: event.target.value })}/></label>
        <Button size="small" danger aria-label={`移除映射 ${index + 1}`} onClick={() => updateSource({ fieldMappings: (source.fieldMappings ?? []).filter((_, position) => index !== position) })}>移除</Button>
      </div>)}
      <Button size="small" block onClick={addFieldMapping} disabled={(source.fieldMappings?.length ?? 0) >= 24}>＋ 新增字段映射</Button>
      {(source.fieldMappings ?? []).length && ((source.fieldMappings ?? []).some((entry) => !validRecordField(entry.field) || !validRecordPath(entry.responsePath) || !entry.responsePath || (entry.saveField && !validRecordField(entry.saveField))) || new Set((source.fieldMappings ?? []).map((entry) => entry.field)).size !== (source.fieldMappings ?? []).length) ? <div role="alert" className="pa-studio-record-error">无效的映射字段不会保存或执行，请检查名称与响应路径。</div> : null}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button block onClick={() => void testSource()}>测试 GET 列表与详情（不修改数据）</Button>
        <Button block type="primary" ghost onClick={connectCurrentPage}>将本页记录组件绑定到此数据源</Button>
        <Popconfirm title="删除此数据源？" description="已绑定的组件必须先解除绑定；可以撤销删除。" onConfirm={() => deleteSource(source.id)} okText="删除" cancelText="取消"><Button block danger>删除数据源</Button></Popconfirm>
      </Space>
      {sourceTestResult ? <div role="status" className="pa-studio-api-result">{sourceTestResult}</div> : null}
      {countDataSourceUses(source.id, doc.decorations) ? <div className="pa-studio-note">当前被 {countDataSourceUses(source.id, doc.decorations)} 个组件引用。删除前需要先解绑。</div> : null}
      <div className="pa-studio-note">这里不提供凭据输入，请勿在 URL 中填写 Token、密钥或密码。测试仅发送 GET；生产环境仍须由后端负责权限和跨域配置。</div>
    </> : null}
    <NativeAasRecoveryPanel/>
  </div>;
  const pagesTab = <div className="pa-studio-inspector-inner">
    <div className="pa-studio-subtitle">页面导航</div>
    <SettingSelect title="导航形式" value={doc.shell.navigation} options={[{ value: 'sidebar', label: '左侧目录栏' }, { value: 'top', label: '顶部菜单' }, { value: 'none', label: '不显示导航' }]} onChange={(value) => updateShell('navigation', value as StudioNavigation)}/>
    {doc.shell.navigation === 'sidebar' ? <label className="pa-studio-setting"><span>目录宽度（像素）</span><InputNumber min={130} max={320} value={doc.shell.sidebarWidth} onChange={(value) => updateShell('sidebarWidth', value ?? 188)} style={{ width: '100%' }}/></label> : null}
    <div className="pa-studio-subtitle">项目页面（{doc.blueprint.pages.length}）</div>
    <div className="pa-studio-page-manager">{orderedNavigation.map((entry, index) => <div className={entry.target === page?.id ? 'is-current' : ''} key={entry.target}><button type="button" onClick={() => selectPage(entry.target)}>{entry.label}</button><span><button title="上移目录顺序" type="button" disabled={index === 0} onClick={() => reorderNavigation(index, -1)}>↑</button><button title="下移目录顺序" type="button" disabled={index === orderedNavigation.length - 1} onClick={() => reorderNavigation(index, 1)}>↓</button><Popconfirm title={`删除「${entry.label}」页面及其所有组件？`} description="操作可撤销；项目至少保留一页。" onConfirm={() => deletePage(entry.target)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}><button type="button" className="pa-studio-page-delete" title="删除页面" aria-label={`删除页面 ${entry.label}`} disabled={doc.blueprint.pages.length <= 1}>×</button></Popconfirm></span></div>)}</div>
    {page ? <TextSetting title="当前页面名称" value={page.title} change={renamePage}/> : null}
    <div className="pa-studio-subtitle">本页数据连接</div>
    <div className="pa-studio-page-connections">{Object.entries(doc.decorations).filter(([id, value]) => id.startsWith(`${page?.id}:`) && (value.recordList || value.recordSubmit || value.api)).map(([id, value]) => <button type="button" key={id} onClick={() => { setSelectedId(id.slice((page?.id ?? '').length + 1)); setInspector('组件数据'); }}><span>{value.recordList ? 'GET 列表' : value.recordSubmit ? 'POST 保存' : `${value.api?.method ?? 'GET'} 请求`}</span><small>{value.recordList?.sourceId ?? value.recordSubmit?.sourceId ?? value.recordList?.url ?? value.recordSubmit?.url ?? value.api?.url}</small></button>)}{!Object.entries(doc.decorations).some(([id, value]) => id.startsWith(`${page?.id}:`) && (value.recordList || value.recordSubmit || value.api)) ? <small>暂无数据连接</small> : null}</div>
    <Button block type="primary" ghost onClick={addThreeApiExample}>＋ 创建列表／详情／保存联动示例</Button>
    <Button block onClick={addLinkedExample}>＋ 创建兼容版记录编辑页</Button>
    <Button block onClick={() => { setNewPageId(`page-${doc.blueprint.pages.length + 1}`); setNewPageTitle('新业务页面'); setNewPageTemplate('blank'); setNewPageOpen(true); }}>＋ 添加页面</Button>
  </div>;
  const styleTab = <div className="pa-studio-inspector-inner">
    <div className="pa-studio-subtitle">当前页面</div>
    <TextSetting title="项目名称" value={doc.blueprint.project.title} change={renameProject}/>
    {page ? <TextSetting title="页面名称" value={page.title} change={renamePage}/> : null}
    <div className="pa-studio-subtitle">主题色</div>
    <div className="pa-studio-accent-choices" role="group" aria-label="主题强调色">
      {accentChoices.map((choice) => <button key={choice.value} type="button" style={{ background: choice.color }} className={doc.design.accent === choice.value ? 'active' : ''} title={choice.label} aria-label={choice.label} aria-pressed={doc.design.accent === choice.value} onClick={() => updateDesign('accent', choice.value)} />)}
    </div>
    <SettingSelect title="外观模式" value={doc.design.surface} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} onChange={(value) => updateDesign('surface', value as DesignConfig['surface'])}/>
    <SettingSelect title="组件密度" value={doc.design.density} options={[{ value: 'comfortable', label: '舒适' }, { value: 'compact', label: '紧凑' }]} onChange={(value) => updateDesign('density', value as DesignConfig['density'])}/>
    <SettingSelect title="圆角" value={doc.design.radius} options={[{ value: 'square', label: '方正' }, { value: 'soft', label: '柔和' }, { value: 'round', label: '圆润' }]} onChange={(value) => updateDesign('radius', value as DesignConfig['radius'])}/>
    <SettingSelect title="字体" value={doc.design.font} options={[{ value: 'sans', label: '无衬线' }, { value: 'editorial', label: '杂志衬线' }, { value: 'technical', label: '代码风格' }]} onChange={(value) => updateDesign('font', value as DesignConfig['font'])}/>
    <SettingSelect title="字号" value={doc.design.typeScale} options={[{ value: 'small', label: '小' }, { value: 'regular', label: '标准' }, { value: 'large', label: '大' }]} onChange={(value) => updateDesign('typeScale', value as DesignConfig['typeScale'])}/>
    <SettingSelect title="间距" value={doc.design.spacing} options={[{ value: 'tight', label: '紧凑' }, { value: 'balanced', label: '平衡' }, { value: 'airy', label: '宽松' }]} onChange={(value) => updateDesign('spacing', value as DesignConfig['spacing'])}/>
    <SettingSelect title="层次阴影" value={doc.design.elevation} options={[{ value: 'flat', label: '扁平' }, { value: 'soft', label: '柔和' }, { value: 'strong', label: '明显' }]} onChange={(value) => updateDesign('elevation', value as DesignConfig['elevation'])}/>
    <SettingSelect title="动态偏好" value={doc.design.motion} options={[{ value: 'system', label: '跟随系统' }, { value: 'reduced', label: '减少动态' }, { value: 'off', label: '关闭动效' }]} onChange={(value) => updateDesign('motion', value as DesignConfig['motion'])}/>
    <SettingSelect title="动画速度" value={doc.design.speed} options={[{ value: 'slow', label: '舒缓' }, { value: 'normal', label: '标准' }, { value: 'fast', label: '快速' }]} onChange={(value) => updateDesign('speed', value as DesignConfig['speed'])}/>
  </div>;

  const settingContent: Record<string, React.ReactNode> = { '页面': pagesTab, '内容': contentTab, '位置': positionTab, '形式': layoutTab, '交互': interactionTab, '特效': effectsTab, '组件数据': dataTab, '接口管理': sourceTab, '流程': workflowTab, '风格': styleTab };
  return <Page><PageContent><div className="pa-studio">
    {noticeElement}<style>{studioEffectStyles}</style>
    <Modal title="向当前项目添加页面" open={newPageOpen} onCancel={() => setNewPageOpen(false)} onOk={addPage} okText="创建并编辑" cancelText="取消" destroyOnHidden>
      <div className="pa-studio-add-page">
        <label>页面名称<Input maxLength={100} value={newPageTitle} onChange={(event) => setNewPageTitle(event.target.value)}/></label>
        <label>页面路径<Input value={newPageId} onChange={(event) => setNewPageId(event.target.value)}/></label>
        <label>初始布局<Radio.Group value={newPageTemplate} onChange={(event) => setNewPageTemplate(event.target.value as PageTemplate)} options={[{ label: '空白', value: 'blank' }, { label: 'Bento', value: 'bento' }, { label: '主从分栏', value: 'master-detail' }]}/></label>
      </div>
    </Modal>
    <div className="pa-studio-head"><div className="pa-studio-title"><span className="pa-studio-eyebrow">可视化工作台 / 页面设计</span><h1>{doc.blueprint.project.title}</h1><span className={`pa-studio-saved ${saved.startsWith('自动保存不可用') ? 'is-warning' : ''}`}>● {saved || '正在编辑'}</span></div>
      <div className="pa-studio-head-actions">{hasBackup ? <Popconfirm title="恢复上一个项目草稿？" onConfirm={restoreBackup}><Button>恢复上次草稿</Button></Popconfirm> : null}<Button onClick={() => { setNewPageId(`page-${doc.blueprint.pages.length + 1}`); setNewPageTitle('新业务页面'); setNewPageTemplate('blank'); setNewPageOpen(true); }}>＋ 添加页面</Button>{doc.blueprint.pages.length > 1 && page ? <Popconfirm title={`删除「${page.title}」页面？`} description="将同时删除本页的组件及导航，可撤销。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => deletePage(page.id)}><Button danger>删除当前页</Button></Popconfirm> : null}<input hidden ref={imported} type="file" accept=".json,application/json" aria-label="打开项目文件" onChange={(event) => void importProject(event)}/><Button onClick={() => imported.current?.click()}>打开项目</Button><Button type="primary" onClick={exportZip}>导出页面代码 <span aria-hidden="true">↗</span></Button></div>
    </div>
    <div className="pa-studio-toolbar"><div className="pa-studio-page-tabs" aria-label="项目页面">{doc.blueprint.pages.map((entry) => <button type="button" key={entry.id} className={page?.id === entry.id ? 'active' : ''} aria-current={page?.id === entry.id ? 'page' : undefined} onClick={() => selectPage(entry.id)}>{entry.title}</button>)}</div><div className="pa-studio-toolbar-actions"><Space.Compact><Button onClick={rollback} disabled={!history.current.length} title="撤销上一次修改">↶ 撤销</Button><Button onClick={redo} disabled={!future.current.length} title="重做">↷ 重做</Button></Space.Compact><Segmented value={viewport} onChange={(value) => setViewport(value as typeof viewport)} options={[{ label: '桌面', value: 'desktop' }, { label: '平板', value: 'tablet' }, { label: '手机', value: 'mobile' }]}/><Radio.Group value={live ? 'live' : 'edit'} onChange={(event) => setLive(event.target.value === 'live')} optionType="button" buttonStyle="solid" options={[{ value: 'edit', label: '编辑' }, { value: 'live', label: '体验' }]}/></div></div>
    <div className={`pa-studio-workspace ${inspectorOpen ? '' : 'is-inspector-collapsed'}`}>
      <aside className="pa-studio-sidebar" aria-label="组件与页面结构"><div className="pa-studio-panel-title">组件库 <Tag>{insertKinds.length} 种</Tag></div><div className="pa-studio-palette-search"><Input allowClear value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="搜索组件名称或类型" aria-label="搜索组件"/></div><div className="pa-studio-palette">{filteredPalette.map((group) => <section key={group.title}><h3>{group.title}</h3><div className="pa-studio-palette-grid">{group.nodes.map((entry) => <button type="button" className="pa-studio-palette-item" key={entry.type} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-atlas-palette', entry.type); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => append(entry.type)}><span>{entry.icon}</span><strong>{entry.label}</strong></button>)}</div></section>)}{!filteredPalette.length ? <div className="pa-studio-no-results">没有匹配的组件</div> : null}</div><div className="pa-studio-panel-title pa-studio-layer-head">页面图层</div><div className="pa-studio-layers">{root ? <Outline node={root} selectedId={chosen?.id ?? ''} onSelect={(id) => { setSelectedId(id); setLive(false); }} onDelete={deleteComponent} decorations={doc.decorations} pageId={page?.id ?? ''}/> : <p>此页面尚无画布结构。</p>}</div></aside>
      <main className="pa-studio-stage"><div className="pa-studio-stage-crumb"><span>{page?.title ?? '页面'}</span><span>{viewport === 'desktop' ? '桌面预览' : viewport === 'tablet' ? '平板预览' : '手机预览'}</span><span>{live ? '交互体验' : '自由编辑'}</span></div><div className="pa-studio-canvas-area"><div className={`pa-studio-device device-${viewport} ${doc.design.motion !== 'system' ? 'atlas-no-motion' : ''}`} style={cssVars}>
        <div className="pa-studio-browserbar"><span/><span/><span/><div>{doc.blueprint.project.id} / {page?.id}</div></div>
        <div className={`pa-studio-preview-shell pa-shell-${doc.shell.navigation}`} style={{ '--studio-sidebar-width': `${doc.shell.sidebarWidth}px` } as CSSProperties}>
          {doc.shell.navigation !== 'none' ? <nav aria-label="项目页面导航" className="pa-studio-preview-navigation"><div className="pa-studio-preview-brand">{doc.blueprint.project.title}</div><div className="pa-studio-preview-links">{orderedNavigation.map((entry) => <button type="button" key={entry.target} className={entry.target === page?.id ? 'active' : ''} onClick={() => selectPage(entry.target)}>{entry.label}</button>)}</div></nav> : null}
          <div className="pa-studio-screen" key={`${page?.id}-${replayKey}`} style={{ minHeight: Math.max(400, ...Object.entries(doc.decorations).filter(([key, meta]) => key.startsWith(`${page?.id}:`) && meta.geometry?.mode === 'absolute').map(([, meta]) => (meta.geometry?.y ?? 0) + (meta.geometry?.height ?? 150) + 52)) }}>
            <div ref={setAbsoluteLayer} className="pa-studio-absolute-layer" aria-label="页面绝对定位图层"/>
            {root ? <StudioCanvas node={root} selectedId={chosen?.id} decorations={doc.decorations} pageId={page?.id} live={live} readOnly={live} onSelect={setSelectedId} onDropItem={drop} onNavigate={selectPage} recordFlow={recordFlow} dataSources={doc.dataSources} tableSelection={tableSelection} onTableSelection={setTableSelection} workflowPages={doc.blueprint.pages.map((entry) => entry.id)} absoluteLayer={absoluteLayer} onWorkflowTrace={(trace) => setWorkflowTraces((before) => appendWorkflowTrace(before, trace))}/> : <div>暂不支持编辑这一页的内容</div>}
          </div>
        </div>
      </div></div></main>
      <aside className="pa-studio-inspector-shell" aria-label="组件设置">
        <div className="pa-studio-inspector-rail" role="toolbar" aria-label="属性分类">
          <button className="pa-studio-rail-collapse" type="button" title={inspectorOpen ? '折叠组件设置' : '展开组件设置'} aria-label={inspectorOpen ? '折叠组件设置' : '展开组件设置'} aria-expanded={inspectorOpen} aria-controls={inspectorOpen ? 'pa-studio-inspector-content' : undefined} onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? '→' : '←'}</button>
          {inspectorSections.map((entry) => <button key={entry.id} type="button" title={entry.id} className={inspectorOpen && inspector === entry.id ? 'active' : ''} aria-pressed={inspectorOpen && inspector === entry.id} onClick={() => { if (inspector === entry.id && inspectorOpen) setInspectorOpen(false); else { setInspector(entry.id); setInspectorOpen(true); } }}><span aria-hidden="true">{entry.icon}</span><small>{entry.id}</small></button>)}
        </div>
        {inspectorOpen ? <div id="pa-studio-inspector-content" className="pa-studio-inspector" role="region" aria-label={`当前属性分类：${inspector}`}><div className="pa-studio-panel-title"><span>{inspector === '页面' ? '页面与导航' : inspector === '接口管理' ? '接口管理' : '组件设置 · ' + inspector}</span><div className="pa-studio-inspector-header-actions">{inspector !== '页面' && inspector !== '接口管理' && chosen && root && chosen.id !== root.id ? <Popconfirm title={`删除「${nodeLabel(chosen)}」及其子组件？`} onConfirm={deleteSelected} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}><Button size="small" danger title="删除选中组件">删除组件</Button></Popconfirm> : null}<Tag color="green">{inspector === '页面' ? `${doc.blueprint.pages.length} 页` : inspector === '接口管理' ? `${doc.dataSources.length} 个` : chosen ? nodeLabel(chosen) : '未选择'}</Tag></div></div>{settingContent[inspector]}</div> : null}
      </aside>
    </div>
    <footer className="pa-studio-bottom"><span>已自动保存 · 可随时导出</span><Space size={12}><Link to="/patterns">布局图鉴</Link><Link to="/patterns/effects">特效图鉴</Link><Link to="/patterns/config">全局风格</Link></Space></footer>
  </div></PageContent></Page>;
}
