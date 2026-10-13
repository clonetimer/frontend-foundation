/** Studio palette extensions. Rendered by the Studio preview and standalone React export.
 * Foundation Blueprint stores each enhanced widget as a supported `placeholder` node;
 * the rendering kind is owned by Studio metadata and never extends the frozen DSL.
 */
export const studioWidgetDefinitions = [
  { kind: 'divider', label: '分割线', icon: '─', group: '内容', defaults: { title: '分割线' } },
  { kind: 'tag', label: '标签', icon: '◆', group: '内容', defaults: { title: '标签', text: '进行中' } },
  { kind: 'alert', label: '提示条', icon: '!', group: '内容', defaults: { title: '操作提示', description: '这里是重要信息。' } },
  { kind: 'progress', label: '进度条', icon: '◓', group: '内容', defaults: { title: '任务进度', percent: 65 } },
  { kind: 'breadcrumb', label: '面包屑', icon: '›', group: '内容', defaults: { title: '当前位置', items: ['首页', '项目', '详情'] } },
  { kind: 'avatar', label: '头像', icon: '◎', group: '内容', defaults: { title: '成员', text: '张' } },
  { kind: 'image', label: '图片', icon: '▧', group: '内容', defaults: { title: '项目图片', src: '', description: '填写图片地址进行预览' } },
  { kind: 'steps', label: '步骤条', icon: '➀', group: '内容', defaults: { title: '业务流程', items: ['提交', '审核', '完成'], percent: 1 } },
  { kind: 'timeline', label: '时间轴', icon: '┆', group: '内容', defaults: { title: '进度记录', items: ['需求确认', '开发实现', '验收交付'] } },
  { kind: 'table', label: '数据表格', icon: '▦', group: '数据', defaults: { title: '任务表格', items: ['方案设计|进行中', '接口联调|待开始', '发布验收|已完成'], pageSize: 5, dataUrl: '', itemsPath: 'data.items', totalPath: 'data.total', detailUrl: '', detailPath: 'data', idField: 'id', tableColumns: 'name|名称\nstatus|状态', filterField: 'status', filterValues: '进行中,待开始,已完成', sortField: 'name' } },
  { kind: 'chart', label: '柱状图', icon: '▥', group: '数据', defaults: { title: '趋势分析', items: ['一月', '二月', '三月', '四月'], values: '32,58,44,77' } },
  { kind: 'descriptions', label: '描述列表', icon: '☷', group: '数据', defaults: { title: '项目属性', items: ['负责人|张三', '状态|进行中', '版本|v1.0'] } },
  { kind: 'list', label: '普通列表', icon: '☰', group: '数据', defaults: { title: '待办事项', items: ['讨论界面结构', '确认接口', '提交验收'] } },
  { kind: 'statistic', label: '统计数值', icon: '◉', group: '数据', defaults: { title: '本周访问', value: '1280', suffix: '次' } },
  { kind: 'textarea', label: '多行输入', icon: '¶', group: '表单', defaults: { title: '备注', placeholder: '请输入备注…' } },
  { kind: 'number', label: '数字输入', icon: '#', group: '表单', defaults: { title: '数量', value: '20' } },
  { kind: 'checkbox', label: '复选框', icon: '☑', group: '表单', defaults: { title: '选项', items: ['通知我', '同步更新'] } },
  { kind: 'radio', label: '单选组', icon: '◉', group: '表单', defaults: { title: '优先级', items: ['低', '中', '高'] } },
  { kind: 'toggle', label: '开关', icon: '◐', group: '表单', defaults: { title: '启用功能' } },
  { kind: 'date', label: '日期选择', icon: '▦', group: '表单', defaults: { title: '截止日期' } },
  { kind: 'slider', label: '滑块', icon: '━', group: '表单', defaults: { title: '进度调整', percent: 45 } },
  { kind: 'rate', label: '评分', icon: '★', group: '表单', defaults: { title: '满意度' } },

  { kind: 'modal', label: '模态弹窗', icon: '▣', group: '反馈', defaults: { title: '操作确认', triggerText: '打开弹窗', description: '请确认后继续操作。', okText: '确认', cancelText: '取消', formFields: '', submitUrl: '', formMode: 'create', submitMethod: 'POST', sourceId: '', successWorkflow: '', failureWorkflow: '' } },
  { kind: 'drawer', label: '侧边抽屉', icon: '◩', group: '反馈', defaults: { title: '详情面板', triggerText: '查看详情', description: '这里展示当前记录详情。', placement: 'right', width: 420, formFields: '', submitUrl: '', formMode: 'create', submitMethod: 'POST', sourceId: '', successWorkflow: '', failureWorkflow: '', okText: '保存', cancelText: '取消' } },
  { kind: 'popconfirm', label: '气泡确认', icon: '☷', group: '反馈', defaults: { title: '确认操作？', triggerText: '执行操作', description: '操作前请确认。', okText: '确认', cancelText: '取消' } },
  { kind: 'skeleton', label: '骨架屏', icon: '▒', group: '反馈', defaults: { title: '加载占位' } },
  { kind: 'empty', label: '空状态', icon: '□', group: '反馈', defaults: { title: '暂无内容', description: '创建数据后会显示在这里' } },
  { kind: 'collapse', label: '折叠面板', icon: '▤', group: '反馈', defaults: { title: '更多信息', text: '展开后显示的内容' } },
  { kind: 'spinner', label: '加载状态', icon: '◌', group: '反馈', defaults: { title: '正在处理…' } },
  { kind: 'file-upload', label: '文件上传', icon: '⇧', group: '文件', defaults: { title: '上传附件', accept: '.pdf,.png,.jpg,.txt', maxSizeMb: 5, uploadUrl: '' } },
  { kind: 'file-list', label: '文件列表', icon: '▤', group: '文件', defaults: { title: '附件清单', items: ['设计方案.pdf|1.2 MB', '界面截图.png|386 KB'] } },
  { kind: 'async-task', label: '异步任务', icon: '◷', group: '任务', defaults: { title: '任务进度', statusUrl: '', statusPath: 'data.status', percentPath: 'data.progress', pollMs: 3000 } },
  { kind: 'async-log', label: '执行日志', icon: '≡', group: '任务', defaults: { title: '执行记录', items: ['提交任务|已完成', '读取数据|进行中', '生成结果|等待'] } },
  { kind: 'line-chart', label: '多序列折线', icon: '⌁', group: '可视化', defaults: { title: '近期趋势', items: ['周一', '周二', '周三', '周四', '周五'], values: '24,42,37,69,53', series: '业务量:24,42,37,69,53;参考值:31,35,40,45,50', unit: '', dataUrl: '', dataPath: 'data', refreshMs: 0 } },
  { kind: 'donut-chart', label: '环形占比', icon: '◕', group: '可视化', defaults: { title: '任务完成率', value: '64', suffix: '%' } },
  { kind: 'heatmap', label: '热力矩阵', icon: '▦', group: '可视化', defaults: { title: '活跃度热力图', values: '12,36,75,20,45,89,55,73,21,66,34,87,45,62,29,94' } }
] as const;
export type StudioWidgetKind = (typeof studioWidgetDefinitions)[number]['kind'];
export const studioWidgetKinds: ReadonlySet<StudioWidgetKind> = new Set(studioWidgetDefinitions.map((item) => item.kind));
export function widgetDefinition(kind: StudioWidgetKind) { return studioWidgetDefinitions.find((item) => item.kind === kind)!; }
export function widgetItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 30).map((item) => item.slice(0, 160)) : [];
}
export function widgetValues(value: unknown): number[] {
  return typeof value === 'string' ? value.split(',').slice(0, 16).map((item) => Number(item.trim())).map((value) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0) : [];
}
/** Measurements are not percentages: signed values and numbers >100 are preserved. */
export interface ChartSeries { name: string; values: number[] }
export function parseChartSeries(series: unknown, legacyValues: unknown): ChartSeries[] {
  const parseNumbers = (source: string): number[] => source.split(',').slice(0, 32)
    .map((part) => Number(part.trim())).filter((num) => Number.isFinite(num) && Math.abs(num) <= 1e12);
  if (typeof series === 'string' && series.trim()) {
    return series.split(';').slice(0, 6).flatMap((segment, index) => {
      const separator = segment.indexOf(':');
      if (separator < 1) return [];
      const name = segment.slice(0, separator).trim().slice(0, 50) || '序列 ' + (index + 1);
      const values = parseNumbers(segment.slice(separator + 1));
      return values.length ? [{ name, values }] : [];
    });
  }
  const values = typeof legacyValues === 'string' ? parseNumbers(legacyValues) : [];
  return values.length ? [{ name: '数值', values }] : [];
}

/** Form declarations are bounded and declarative: key|label|text/email/number|required/optional. */
export interface OverlayRecordSelection { selectedId: string; selected: Record<string, unknown> | null; detailStatus?: 'idle' | 'loading' | 'ready' | 'error' }
export function overlaySubmitUrl(template: unknown, mode: 'create' | 'edit-selected', selectedId = ''): string | undefined {
  if (typeof template !== 'string' || template.length > 500) return undefined;
  if (mode === 'create') return !/[{}]/.test(template) ? safeWidgetImageUrl(template) : undefined;
  if (!selectedId || selectedId.length > 120 || template.split('{id}').length !== 2) return undefined;
  if (/[{}]/.test(template.replace('{id}', ''))) return undefined;
  return safeWidgetImageUrl(template.replace('{id}', encodeURIComponent(selectedId)));
}
export interface OverlayFormField { key: string; label: string; type: 'text' | 'email' | 'number'; required: boolean }
export function parseOverlayFormFields(value: unknown): OverlayFormField[] {
  if (typeof value !== 'string' || value.length > 1600 || !value.trim()) return [];
  const lines = value.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 8) return [];
  const seen = new Set<string>();
  const fields: OverlayFormField[] = [];
  for (const line of lines) {
    const pieces = line.split('|').map((part) => part.trim());
    if (pieces.length !== 4) return [];
    const [key, label, type, required] = pieces;
    if (!key || !/^[a-zA-Z][a-zA-Z\d_]{0,39}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key) || seen.has(key)) return [];
    if (!label || label.length > 48 || !['text', 'email', 'number'].includes(type ?? '') || !['required', 'optional'].includes(required ?? '')) return [];
    seen.add(key);
    fields.push({ key, label, type: type as OverlayFormField['type'], required: required === 'required' });
  }
  return fields;
}
export function validateOverlayForm(fields: readonly OverlayFormField[], draft: Record<string, string>): { errors: Record<string, string>; payload: Record<string, string | number> } {
  const errors: Record<string, string> = {};
  const payload: Record<string, string | number> = {};
  for (const field of fields) {
    const value = (draft[field.key] ?? '').trim();
    if (field.required && !value) { errors[field.key] = '此项必填'; continue; }
    if (value.length > 240) { errors[field.key] = '最多 240 个字符'; continue; }
    if (!value) { if (!field.required) payload[field.key] = ''; continue; }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { errors[field.key] = '邮箱格式无效'; continue; }
    if (field.type === 'number') {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e12) { errors[field.key] = '请输入有效数字'; continue; }
      payload[field.key] = Number(value);
    } else payload[field.key] = value;
  }
  return { errors, payload };
}

/** Remote table schemas are deliberately flat, typed and size-bounded. */
export interface RemoteTableColumn { key: string; title: string }
export interface RemoteTableRow { key: string; [field: string]: string | number | boolean | null }
export interface RemoteTablePage { items: RemoteTableRow[]; total: number }
const remoteTableKey = (key: string): boolean => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) && !['constructor','prototype','__proto__'].includes(key);
export function parseRemoteTableColumns(value: unknown): RemoteTableColumn[] {
  if (typeof value !== 'string' || value.length > 1000 || !value.trim()) return [];
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 1 || lines.length > 8) return [];
  const used = new Set<string>();
  const columns: RemoteTableColumn[] = [];
  for (const line of lines) {
    const pieces = line.split('|').map((item) => item.trim());
    if (pieces.length !== 2) return [];
    const key = pieces[0] ?? '', title = pieces[1] ?? '';
    if (!remoteTableKey(key) || !title || title.length > 50 || used.has(key)) return [];
    used.add(key);
    columns.push({ key, title });
  }
  return columns;
}
export function parseRemoteTablePage(value: unknown, idField: string, columns: readonly RemoteTableColumn[]): RemoteTablePage | null {
  if (!remoteTableKey(idField) || !columns.length || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.items) || root.items.length > 100 || !Number.isSafeInteger(root.total) || (root.total as number) < 0 || (root.total as number) > 10_000_000) return null;
  const ids = new Set<string>();
  const items: RemoteTableRow[] = [];
  for (const entry of root.items) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const raw = entry as Record<string, unknown>;
    const id = raw[idField];
    if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length < 1 || String(id).length > 120 || !Number.isFinite(typeof id === 'number' ? id : 0) || ids.has(String(id))) return null;
    ids.add(String(id));
    const row: RemoteTableRow = { key: String(id), [idField]: id };
    for (const column of columns) {
      const data = raw[column.key];
      if (data !== undefined && data !== null && typeof data !== 'string' && typeof data !== 'number' && typeof data !== 'boolean') return null;
      if (typeof data === 'string' && data.length > 240) return null;
      if (typeof data === 'number' && (!Number.isFinite(data) || Math.abs(data) > 1e12)) return null;
      row[column.key] = data === undefined ? null : data;
    }
    // Selected-record editing needs only whitelisted flat column data, never arbitrary objects.
    items.push(row);
  }
  return { items, total: root.total as number };
}

/** Strict bounded JSON contract for live chart APIs: {items, series:[{name,values}]}. */
export interface ChartDataset { items: string[]; series: ChartSeries[] }
export function parseRemoteChartDataset(value: unknown): ChartDataset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.items) || !Array.isArray(source.series) || source.series.length < 1 || source.series.length > 6) return null;
  if (source.items.length < 1 || source.items.length > 32 || !source.items.every((item) => typeof item === 'string' && item.length <= 80)) return null;
  const series: ChartSeries[] = [];
  for (const raw of source.series) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 50 || !Array.isArray(item.values) || item.values.length !== source.items.length) return null;
    if (!item.values.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e12)) return null;
    series.push({ name: item.name.trim(), values: item.values as number[] });
  }
  return { items: source.items as string[], series };
}

export function safeWidgetImageUrl(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.length > 500 || (/[\\\s]/.test(url) || Array.from(url).some((char) => char.charCodeAt(0) < 32)) || url.startsWith('//')) return undefined;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try { const target = new URL(url); return ['http:', 'https:'].includes(target.protocol) && !target.username && !target.password ? url : undefined; } catch { return undefined; }
}

/** Normalize only declarative presentation values. Never put these in Foundation Blueprint props. */
function normalizedOverlayOption(kind: StudioWidgetKind, key: string, value: unknown): string | undefined {
  if (kind !== 'modal' && kind !== 'drawer') return undefined;
  if (key === 'formMode') return value === 'edit-selected' ? 'edit-selected' : 'create';
  if (key === 'submitMethod') return value === 'PATCH' ? 'PATCH' : 'POST';
  if (key === 'sourceId') return typeof value === 'string' && /^[a-z][a-z0-9-]{0,35}$/.test(value) ? value : '';
  return undefined;
}
export function normalizeWidgetProps(kind: StudioWidgetKind, value: unknown): Record<string, unknown> {
  const definition = widgetDefinition(kind);
  const defaults: Record<string, unknown> = { ...definition.defaults };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const source = value as Record<string, unknown>;
  for (const [key, initial] of Object.entries(defaults)) {
    const candidate = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
    if (typeof initial === 'string' && typeof candidate === 'string') {
      const overlayOption = normalizedOverlayOption(kind, key, candidate);
      defaults[key] = overlayOption ?? candidate.slice(0, ['src', 'statusUrl', 'uploadUrl', 'dataUrl', 'submitUrl', 'detailUrl'].includes(key) ? 500 : key === 'formFields' ? 1600 : key === 'tableColumns' ? 1000 : key === 'filterValues' ? 500 : key === 'successWorkflow' || key === 'failureWorkflow' ? 5000 : key === 'series' ? 1200 : 240);
    }
    if (typeof initial === 'number' && typeof candidate === 'number' && Number.isFinite(candidate)) defaults[key] = Math.round(Math.max(key === 'pollMs' ? 1500 : key === 'maxSizeMb' ? 1 : key === 'width' ? 280 : key === 'refreshMs' ? (candidate > 0 ? 5000 : 0) : 0, Math.min(key === 'pollMs' ? 30000 : key === 'refreshMs' ? 60000 : key === 'pageSize' ? 20 : key === 'maxSizeMb' ? 30 : key === 'width' ? 800 : 100, candidate)));
    if (Array.isArray(initial) && Array.isArray(candidate)) defaults[key] = candidate.filter((item): item is string => typeof item === 'string').slice(0,30).map((item) => item.slice(0,160));
  }
  return defaults;
}
