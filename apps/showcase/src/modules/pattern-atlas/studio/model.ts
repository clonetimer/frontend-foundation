import type { CompositionNode } from '../bridge';
import { buildProjectBlueprint, parseExistingBlueprint, type ProjectBlueprintDocument } from '../builder/project-blueprint';
import { effects } from '../effects/catalog';
import { readDesignConfig, normalizeDesignConfig, type DesignConfig } from '../effects/config';
import { normalizeApiBinding, type StudioApiBinding } from './api';
import { normalizeDataSources, type StudioDataSource } from './data-sources';
import { normalizeRecordField, normalizeRecordList, normalizeRecordSubmit, type StudioRecordFieldBinding, type StudioRecordListBinding, type StudioRecordSubmitBinding } from './record-bindings';
import { normalizeStudioWorkflow, type StudioWorkflow } from './studio-workflows';
import { studioWidgetDefinitions, studioWidgetKinds, normalizeWidgetProps, type StudioWidgetKind } from './widgets';

/** Studio-only presentation metadata; never inject undocumented fields into Foundation Blueprint. */
export type StudioInteraction = 'none' | 'notice' | 'toggle' | 'navigate';
export type StudioPattern = 'default' | 'bento' | 'kanban' | 'timeline' | 'accordion';
export interface StudioGeometry {
  /** Absolute: coordinates measured from the containing layout's top-left.
   * Missing mode preserves pre-Phase-13 relative offsets in older files. */
  mode?: 'absolute';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
export type StudioNavigation = 'sidebar' | 'top' | 'none';
export interface StudioShell { navigation: StudioNavigation; sidebarWidth: number; }
export interface StudioDecoration {
  geometry?: StudioGeometry | undefined;
  api?: StudioApiBinding | undefined;
  recordList?: StudioRecordListBinding | undefined;
  recordField?: StudioRecordFieldBinding | undefined;
  recordSubmit?: StudioRecordSubmitBinding | undefined;
  widgetKind?: StudioWidgetKind | undefined;
  widgetProps?: Record<string, unknown> | undefined;
  workflow?: StudioWorkflow | undefined;
  effect?: string;
  pattern?: StudioPattern;
  interaction?: StudioInteraction;
  feedback?: string;
  targetPage?: string;
}
export interface StudioDocument {
  format: 'pattern-atlas-studio';
  version: 1;
  blueprint: ProjectBlueprintDocument;
  design: DesignConfig;
  decorations: Record<string, StudioDecoration>;
  shell: StudioShell;
  dataSources: StudioDataSource[];
}
export type NativeInsertKind = 'records' | 'stack' | 'grid' | 'split' | 'tabs' | 'panel' | 'text' | 'metric' | 'button' | 'input' | 'select' | 'placeholder';
export type InsertKind = NativeInsertKind | StudioWidgetKind;
export const paletteGroups: ReadonlyArray<{ title: string; nodes: ReadonlyArray<{ type: InsertKind; label: string; icon: string }> }> = [
  { title: '布局结构', nodes: [{ type: 'stack', label: '自由排列', icon: '☷' }, { type: 'grid', label: '网格布局', icon: '▦' }, { type: 'split', label: '左右分栏', icon: '◧' }, { type: 'tabs', label: '标签切换', icon: '▤' }] },
  { title: '内容展示', nodes: [{ type: 'panel', label: '内容卡片', icon: '▢' }, { type: 'text', label: '文字标题', icon: 'T' }, { type: 'metric', label: '数字指标', icon: '◉' }, { type: 'placeholder', label: '内容占位', icon: '⊞' }, ...studioWidgetDefinitions.filter((item) => item.group === '内容').map((item) => ({ type: item.kind, label: item.label, icon: item.icon }))] },
  { title: '数据与图表', nodes: [{ type: 'records', label: '记录列表', icon: '▤' }, ...studioWidgetDefinitions.filter((item) => item.group === '数据').map((item) => ({ type: item.kind, label: item.label, icon: item.icon }))] },
  { title: '输入与表单', nodes: [{ type: 'input', label: '输入框', icon: '⌨' }, { type: 'select', label: '选择器', icon: '⌄' }, ...studioWidgetDefinitions.filter((item) => item.group === '表单').map((item) => ({ type: item.kind, label: item.label, icon: item.icon }))] },
  { title: '文件处理', nodes: studioWidgetDefinitions.filter((item) => item.group === '文件').map((item) => ({ type: item.kind, label: item.label, icon: item.icon })) },
  { title: '异步任务', nodes: studioWidgetDefinitions.filter((item) => item.group === '任务').map((item) => ({ type: item.kind, label: item.label, icon: item.icon })) },
  { title: '更多可视化', nodes: studioWidgetDefinitions.filter((item) => item.group === '可视化').map((item) => ({ type: item.kind, label: item.label, icon: item.icon })) },
  { title: '操作与反馈', nodes: [{ type: 'button', label: '操作按钮', icon: '↗' }, ...studioWidgetDefinitions.filter((item) => item.group === '反馈').map((item) => ({ type: item.kind, label: item.label, icon: item.icon }))] }
];
export const insertKinds = paletteGroups.flatMap((group) => group.nodes.map((item) => item.type));
const effectSet = new Set(effects.map((item) => item.id));
const patterns: readonly StudioPattern[] = ['default', 'bento', 'kanban', 'timeline', 'accordion'];
const actions: readonly StudioInteraction[] = ['none', 'notice', 'toggle', 'navigate'];
const MAX_SOURCE_BYTES = 1_000_000;
const MAX_NODES = 300;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function firstPageId(blueprint: ProjectBlueprintDocument): string { return blueprint.pages[0]?.id ?? ''; }
export function createStudioDocument(blueprint?: ProjectBlueprintDocument): StudioDocument {
  return { format: 'pattern-atlas-studio', version: 1, blueprint: blueprint ?? buildProjectBlueprint({ mode: 'new', projectId: 'my-workspace', projectTitle: '我的项目', pageId: 'overview', pageTitle: '项目概览', template: 'bento' }), design: readDesignConfig(), decorations: {}, shell: { navigation: 'sidebar', sidebarWidth: 188 }, dataSources: [] };
}

export function walkNodes(root: CompositionNode | undefined, visitor: (node: CompositionNode, parent: CompositionNode | undefined, index: number) => void): void {
  if (!root) return;
  const step = (node: CompositionNode, parent: CompositionNode | undefined, index: number, depth: number) => {
    if (depth > 24) throw new Error('页面层级过深。');
    visitor(node, parent, index);
    for (const [position, child] of (node.children ?? []).entries()) step(child, node, position, depth + 1);
  };
  step(root, undefined, 0, 0);
}
export function findNode(root: CompositionNode | undefined, id: string): CompositionNode | undefined {
  let found: CompositionNode | undefined;
  walkNodes(root, (node) => { if (node.id === id) found = node; });
  return found;
}
export function mayContain(node: CompositionNode): boolean { return node.kind === 'layout' || node.type === 'panel'; }
export function nodeLabel(node: CompositionNode): string {
  const props = node.props ?? {};
  if (node.type === 'text') return String(props.text ?? '文字');
  if (node.type === 'metric') return String(props.label ?? '指标');
  return String(props.title ?? props.label ?? ({ stack: '排列', grid: '网格', split: '分栏', tabs: '标签', panel: '卡片', input: '输入框', select: '选择器', placeholder: '占位区域', button: '按钮' } as Record<string, string>)[node.type] ?? node.type);
}
export function createNode(type: InsertKind, id: string): CompositionNode {
  if (studioWidgetKinds.has(type as StudioWidgetKind)) {
    const definition = studioWidgetDefinitions.find((item) => item.kind === type)!;
    return { id, kind: 'widget', type: 'placeholder', props: { title: definition.label, description: '在设计工作台中设置内容' } };
  }
  switch (type) {
    case 'records': return { id, kind: 'widget', type: 'placeholder', props: { title: '记录列表', description: '体验模式中选择记录' } };
    case 'stack': return { id, kind: 'layout', type, props: { gap: 16 }, children: [] };
    case 'grid': return { id, kind: 'layout', type, props: { columns: 2, gap: 14 }, children: [] };
    case 'split': return { id, kind: 'layout', type, props: { secondarySize: 280, gap: 16 }, children: [createNode('panel', `${id}Left`), createNode('panel', `${id}Right`)] };
    case 'tabs': return { id, kind: 'layout', type, props: { tabPosition: 'top' }, children: [{ ...createNode('panel', `${id}Tab`), label: '标签一' }] };
    case 'panel': return { id, kind: 'widget', type, props: { title: '新卡片' }, children: [createNode('text', `${id}Text`)] };
    case 'text': return { id, kind: 'widget', type, props: { text: '在这里输入内容', variant: 'body' } };
    case 'metric': return { id, kind: 'widget', type, props: { label: '核心指标', value: '128' } };
    case 'button': return { id, kind: 'widget', type, props: { label: '立即操作', type: 'primary' } };
    case 'input': return { id, kind: 'widget', type, props: { label: '字段名称', placeholder: '请输入…' } };
    case 'select': return { id, kind: 'widget', type, props: { label: '选择项目', options: [{ label: '选项一', value: 'one' }, { label: '选项二', value: 'two' }] } };
    case 'placeholder': return { id, kind: 'widget', type, props: { title: '内容区域', description: '在这里添加实际内容' } };
    default: throw new Error('未知的组件类型');
  }
}
export function freshNodeId(root: CompositionNode, type: InsertKind): string {
  const taken = new Set<string>();
  walkNodes(root, (node) => taken.add(node.id));
  for (let n = 1; n <= 10_000; n += 1) if (!taken.has(`${type}${n}`) && !taken.has(`${type}${n}Left`) && !taken.has(`${type}${n}Right`) && !taken.has(`${type}${n}Text`) && !taken.has(`${type}${n}Tab`)) return `${type}${n}`;
  throw new Error('无法创建新的组件编号。');
}
function clone<T>(value: T): T { return structuredClone(value); }
function childrenOf(node: CompositionNode): CompositionNode[] { return node.children ?? []; }
export function parentOf(root: CompositionNode, id: string): { parent: CompositionNode; index: number } | undefined {
  let position: { parent: CompositionNode; index: number } | undefined;
  walkNodes(root, (node, parent, index) => { if (node.id === id && parent) position = { parent, index }; });
  return position;
}
export function validateTree(root: CompositionNode): void {
  const seen = new Set<string>();
  let count = 0;
  walkNodes(root, (node) => {
    count += 1;
    if (count > MAX_NODES) throw new Error('页面组件数量超过 300 个。');
    if (!/^[A-Za-z][A-Za-z\d_-]*$/.test(node.id) || seen.has(node.id)) throw new Error('组件标识重复或无效。');
    seen.add(node.id);
    if (node.type === 'split' && childrenOf(node).length !== 2) throw new Error('左右分栏始终需要两个区域。');
    if (node.type === 'tabs' && childrenOf(node).length < 1) throw new Error('标签布局至少需要一个标签。');
    if (node.type === 'tabs' && childrenOf(node).some((child) => !child.label)) throw new Error('标签必须具有名称。');
    if (!mayContain(node) && childrenOf(node).length) throw new Error('此组件不能包含子组件。');
  });
}
export function insertNode(root: CompositionNode, targetId: string, node: CompositionNode, where: 'inside' | 'before' | 'after' = 'inside'): CompositionNode {
  const copy = clone(root);
  const target = findNode(copy, targetId);
  if (!target) throw new Error('没有找到放置位置。');
  if (where === 'inside') {
    if (!mayContain(target)) throw new Error('请把组件放入布局或卡片内。');
    if (target.type === 'split' && childrenOf(target).length >= 2) throw new Error('左右分栏已经有两个区域，请拖入其中一个区域。');
    const children = childrenOf(target);
    target.children = [...children, target.type === 'tabs' ? { ...node, label: node.label ?? `标签 ${children.length + 1}` } : node];
  } else {
    const location = parentOf(copy, targetId);
    if (!location) throw new Error('根布局不能被替换或移动。');
    const { parent, index } = location;
    if (parent.type === 'split') throw new Error('左右分栏只能保留两个区域，请放入分栏内部。');
    const siblings = childrenOf(parent);
    siblings.splice(index + (where === 'after' ? 1 : 0), 0, parent.type === 'tabs' ? { ...node, label: node.label ?? `标签 ${siblings.length + 1}` } : node);
    parent.children = siblings;
  }
  validateTree(copy);
  return copy;
}
export function removeNode(root: CompositionNode, id: string): CompositionNode {
  const copy = clone(root);
  const location = parentOf(copy, id);
  if (!location) throw new Error('不能删除页面根布局。');
  if (location.parent.type === 'split' || (location.parent.type === 'tabs' && childrenOf(location.parent).length === 1)) throw new Error('该区域是布局必需的，请修改内容而非直接删除。');
  location.parent.children = childrenOf(location.parent).filter((child) => child.id !== id);
  validateTree(copy);
  return copy;
}
export function moveNode(root: CompositionNode, id: string, targetId: string, where: 'inside' | 'before' | 'after'): CompositionNode {
  if (id === targetId || id === root.id) throw new Error('不能把组件移动到自身或移动根布局。');
  const original = findNode(root, id);
  if (!original) throw new Error('组件已不存在。');
  let isDescendant = false;
  walkNodes(original, (item) => { if (item.id === targetId) isDescendant = true; });
  if (isDescendant) throw new Error('不能将父级布局放入自己的子节点。');
  const removed = removeNode(root, id);
  return insertNode(removed, targetId, clone(original), where);
}
export function editNode(root: CompositionNode, id: string, update: (node: CompositionNode) => void): CompositionNode {
  const copy = clone(root);
  const node = findNode(copy, id);
  if (!node) throw new Error('未找到组件。');
  update(node);
  validateTree(copy);
  return copy;
}
export function editPageDocument(document: StudioDocument, pageId: string, update: (root: CompositionNode) => CompositionNode): StudioDocument {
  const copy = clone(document);
  const page = copy.blueprint.pages.find((item) => item.id === pageId);
  if (!page?.composition) throw new Error('该页面没有可编辑的布局树。');
  page.composition = update(page.composition);
  return copy;
}
/** Deletes a page and its navigation/Studio metadata, never the last project page. */
export function removeStudioPage(document: StudioDocument, pageId: string): StudioDocument {
  if (!document.blueprint.pages.some((item) => item.id === pageId)) throw new Error('页面不存在。');
  if (document.blueprint.pages.length <= 1) throw new Error('项目至少保留一个页面，无法删除最后一页。');
  const copy = clone(document);
  copy.blueprint.pages = copy.blueprint.pages.filter((item) => item.id !== pageId);
  copy.blueprint.navigation.items = copy.blueprint.navigation.items.filter((item) => item.target !== pageId);
  // Home-page semantics are explicit: exactly the new first page becomes index.
  copy.blueprint.pages.forEach((page, index) => {
    if (index === 0) { page.index = true; delete page.route; }
    else { delete page.index; page.route = page.id; }
  });
  const nextDecorations: Record<string, StudioDecoration> = {};
  for (const [key, value] of Object.entries(copy.decorations)) {
    if (key.startsWith(`${pageId}:`)) continue;
    const next = { ...value };
    if (next.targetPage === pageId) { delete next.targetPage; if (next.interaction === 'navigate') delete next.interaction; }
    if (next.workflow) next.workflow.steps = next.workflow.steps.map((step) => step.type === 'navigate' && step.pageId === pageId ? { ...step, pageId: '' } : step);
    nextDecorations[key] = next;
  }
  copy.decorations = nextDecorations;
  return copy;
}

/** Removes Studio metadata for the deleted component and all of its descendants. */
export function removeStudioComponent(document: StudioDocument, pageId: string, nodeId: string): StudioDocument {
  const page = document.blueprint.pages.find((entry) => entry.id === pageId);
  const target = findNode(page?.composition, nodeId);
  if (!target) throw new Error('组件不存在。');
  const removedIds = new Set<string>();
  walkNodes(target, (node) => removedIds.add(node.id));
  const copy = editPageDocument(document, pageId, (root) => removeNode(root, nodeId));
  for (const id of removedIds) { delete copy.decorations[`${pageId}:${id}`]; delete copy.decorations[id]; }
  // Drop cross-component actions pointing to deleted components, including branch actions.
  for (const [key, decoration] of Object.entries(copy.decorations)) {
    if (!decoration.workflow || (!key.startsWith(`${pageId}:`) && key.includes(':'))) continue;
    const workflow = structuredClone(decoration.workflow);
    const prune = (steps: typeof workflow.steps): typeof workflow.steps => steps
      .filter((step) => step.type !== 'emit' || !removedIds.has(step.targetId))
      .map((step) => step.type === 'branch' ? { ...step,
        onTrue: step.onTrue.filter((child) => child.type !== 'emit' || !removedIds.has(child.targetId)),
        onFalse: step.onFalse.filter((child) => child.type !== 'emit' || !removedIds.has(child.targetId)) } : step);
    workflow.steps = prune(workflow.steps);
    copy.decorations[key] = { ...decoration, workflow: workflow.steps.length ? workflow : undefined };
  }
  return copy;
}

export function setDecoration(document: StudioDocument, nodeId: string, patch: Partial<StudioDecoration>): StudioDocument {
  const copy = clone(document);
  const next: StudioDecoration = { ...copy.decorations[nodeId], ...patch };
  if (next.geometry && !Object.keys(next.geometry).length) delete next.geometry;
  if (!next.api) delete next.api;
  if (!next.recordList) delete next.recordList;
  if (!next.recordField) delete next.recordField;
  if (!next.recordSubmit) delete next.recordSubmit;
  if (!next.widgetKind) delete next.widgetProps;
  if (!next.workflow) delete next.workflow;
  if (!next.effect) delete next.effect;
  if (next.pattern === 'default') delete next.pattern;
  if (next.interaction === 'none') delete next.interaction;
  copy.decorations[nodeId] = next;
  return copy;
}
export function normalizeGeometry(input: unknown): StudioGeometry | undefined {
  if (!isRecord(input)) return undefined;
  const result: StudioGeometry = {};
  if (input.mode === 'absolute') result.mode = 'absolute';
  const limits: Record<'x' | 'y' | 'width' | 'height', [number, number]> = {
    x: [-2000, 2000], y: [-2000, 2000], width: [40, 2400], height: [24, 1800]
  };
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const value = input[key];
    const [minimum, maximum] = result.mode === 'absolute' && (key === 'x' || key === 'y') ? [0, 2400] : limits[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum) result[key] = Math.round(value);
  }
  return Object.keys(result).length ? result : undefined;
}
export function normalizeStudioShell(value: unknown): StudioShell {
  if (!isRecord(value)) return { navigation: 'sidebar', sidebarWidth: 188 };
  const navigation: StudioNavigation = value.navigation === 'none' || value.navigation === 'top' ? value.navigation : 'sidebar';
  const sidebarWidth = typeof value.sidebarWidth === 'number' && Number.isInteger(value.sidebarWidth) && value.sidebarWidth >= 130 && value.sidebarWidth <= 320 ? value.sidebarWidth : 188;
  return { navigation, sidebarWidth };
}
export function cleanStudioDocument(input: unknown): StudioDocument {
  if (!isRecord(input) || input.format !== 'pattern-atlas-studio' || input.version !== 1) throw new Error('这不是受支持的设计工作台文件。');
  const blueprint = parseExistingBlueprint(JSON.stringify(input.blueprint ?? null));
  const rawDecorations = isRecord(input.decorations) ? input.decorations : {};
  const ids = new Set<string>();
  for (const page of blueprint.pages) {
    if (page.composition) {
      validateTree(page.composition);
      walkNodes(page.composition, (node) => { ids.add(`${page.id}:${node.id}`); ids.add(node.id); });
    }
  }
  const decorations: Record<string, StudioDecoration> = {};
  for (const [id, value] of Object.entries(rawDecorations)) {
    if (!ids.has(id) || !isRecord(value)) continue;
    const effect = typeof value.effect === 'string' && effectSet.has(value.effect) ? value.effect : undefined;
    const pattern = patterns.find((item) => item === value.pattern);
    const interaction = actions.find((item) => item === value.interaction);
    const feedback = typeof value.feedback === 'string' ? value.feedback.slice(0, 160) : undefined;
    const targetPage = typeof value.targetPage === 'string' && blueprint.pages.some((page) => page.id === value.targetPage) ? value.targetPage : undefined;
    const pageId = id.includes(':') ? id.slice(0, id.indexOf(':')) : '';
    const nodeId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    const owner = blueprint.pages.find((entry) => !pageId || entry.id === pageId);
    const node = owner?.composition ? findNode(owner.composition, nodeId) : undefined;
    const method = node?.type === 'button' ? 'POST' : node?.type === 'text' || node?.type === 'metric' ? 'GET' : undefined;
    const api = method ? normalizeApiBinding(value.api, method) : undefined;
    const geometry = normalizeGeometry(value.geometry);
    const recordList = node?.type === 'placeholder' ? normalizeRecordList(value.recordList) : undefined;
    const recordField = ['input', 'select', 'text', 'metric'].includes(node?.type ?? '') ? normalizeRecordField(value.recordField) : undefined;
    const recordSubmit = node?.type === 'button' ? normalizeRecordSubmit(value.recordSubmit) : undefined;
    const widgetKind = node?.type === 'placeholder' && studioWidgetKinds.has(value.widgetKind as StudioWidgetKind) && !recordList ? value.widgetKind as StudioWidgetKind : undefined;
    const widgetProps = widgetKind ? normalizeWidgetProps(widgetKind, value.widgetProps) : undefined;
    const targetIds: string[] = [];
    if (owner?.composition) walkNodes(owner.composition, (candidate) => targetIds.push(candidate.id));
    const workflow = node?.type === 'button' ? normalizeStudioWorkflow(value.workflow, blueprint.pages.map((page) => page.id), targetIds) : undefined;
    decorations[id] = { ...(workflow ? { workflow } : {}), ...(widgetKind ? { widgetKind, widgetProps } : {}), ...(recordList ? { recordList } : {}), ...(recordField ? { recordField } : {}), ...(recordSubmit ? { recordSubmit } : {}), ...(geometry ? { geometry } : {}), ...(api ? { api } : {}), ...(effect ? { effect } : {}), ...(pattern && pattern !== 'default' ? { pattern } : {}), ...(interaction && interaction !== 'none' ? { interaction } : {}), ...(feedback ? { feedback } : {}), ...(targetPage ? { targetPage } : {}) };
  }
  return { format: 'pattern-atlas-studio', version: 1, blueprint, design: normalizeDesignConfig(input.design), decorations, shell: normalizeStudioShell(input.shell), dataSources: normalizeDataSources(input.dataSources) };
}
export function parseStudioFile(text: string): StudioDocument {
  if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES) throw new Error('文件超过 1MB，无法在浏览器中导入。');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { throw new Error('文件内容不是有效的 JSON。'); }
  if (isRecord(parsed) && parsed.format === 'pattern-atlas-studio') return cleanStudioDocument(parsed);
  return createStudioDocument(parseExistingBlueprint(text));
}
export function serializeStudioDocument(document: StudioDocument): string { return `${JSON.stringify(cleanStudioDocument(document), null, 2)}\n`; }

const STORAGE_KEY = 'foundation-showcase:pattern-atlas:studio-v1';
const PENDING_KEY = 'foundation-showcase:pattern-atlas:pending-blueprint-v1';
const BACKUP_KEY = 'foundation-showcase:pattern-atlas:studio-backup-v1';
export function readStudioDocument(): StudioDocument {
  if (typeof window === 'undefined') return createStudioDocument();
  try { const content = window.localStorage.getItem(STORAGE_KEY); return content ? parseStudioFile(content) : createStudioDocument(); }
  catch { return createStudioDocument(); }
}
export function saveStudioDocument(document: StudioDocument): boolean {
  if (typeof window === 'undefined') return false;
  try { window.localStorage.setItem(STORAGE_KEY, serializeStudioDocument(document)); return true; }
  catch { return false; }
}
export function handoffToStudio(blueprint: ProjectBlueprintDocument): void {
  if (typeof window === 'undefined') return;
  // Handoff is consumed once. Existing studio is never silently overwritten on page refresh.
  try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(blueprint)); }
  catch { throw new Error('浏览器无法保存待编辑的页面。请先启用站点存储权限。'); }
}
export function takeStudioHandoff(): StudioDocument | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.sessionStorage.getItem(PENDING_KEY);
    if (!value) return undefined;
    const incoming = createStudioDocument(parseExistingBlueprint(value));
    // Keep one recoverable previous draft when navigating from the creation wizard.
    try {
      const previous = window.localStorage.getItem(STORAGE_KEY);
      if (previous) window.localStorage.setItem(BACKUP_KEY, previous);
    } catch { /* Session handoff still works when local storage is unavailable. */ }
    window.sessionStorage.removeItem(PENDING_KEY);
    return incoming;
  } catch { return undefined; }
}

/** Recover the previous working document after accepting a new page handoff. */
export function readStudioBackup(): StudioDocument | undefined {
  if (typeof window === 'undefined') return undefined;
  try { const value = window.localStorage.getItem(BACKUP_KEY); return value ? parseStudioFile(value) : undefined; }
  catch { return undefined; }
}

export function clearStudioBackup(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(BACKUP_KEY); } catch { /* Browser may deny storage */ }
}

export function backupStudioDocument(document: StudioDocument): boolean {
  if (typeof window === 'undefined') return false;
  try { window.localStorage.setItem(BACKUP_KEY, serializeStudioDocument(document)); return true; }
  catch { return false; }
}
