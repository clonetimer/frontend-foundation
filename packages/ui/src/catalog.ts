export type UiCompositionKind = 'block' | 'pattern' | 'layout' | 'widget';

export interface UiCompositionCatalogEntry {
  id: string;
  kind: UiCompositionKind;
  exportName: string;
  description: string;
  tags: readonly string[];
}

/**
 * Stable, serializable catalog for planners, generators and future visual
 * editors. Runtime components stay ordinary React source exports; design tools
 * reason over governed IDs instead of inventing arbitrary DOM structures.
 */
export const foundationUiCatalog = Object.freeze([
  { id: 'panel', kind: 'block', exportName: 'PanelBlock', description: '通用带标题内容面板。', tags: ['container', 'content'] },
  { id: 'metric', kind: 'block', exportName: 'MetricBlock', description: '单指标状态卡。', tags: ['metric', 'dashboard'] },
  { id: 'metric-grid', kind: 'block', exportName: 'MetricGrid', description: '自适应指标卡网格。', tags: ['metric', 'dashboard', 'responsive'] },
  { id: 'dashboard', kind: 'pattern', exportName: 'DashboardPattern', description: '12 列可组合仪表盘布局。', tags: ['dashboard', 'overview'] },
  { id: 'master-detail', kind: 'pattern', exportName: 'MasterDetailPattern', description: '左主列表、右详情工作区布局。', tags: ['master-detail', 'management'] },
  { id: 'split-pane', kind: 'pattern', exportName: 'SplitPanePattern', description: '主区域与固定宽度辅助区域布局。', tags: ['split', 'workspace'] },
  { id: 'workspace', kind: 'pattern', exportName: 'WorkspacePattern', description: '工具栏、主区、侧区、底部区组合工作台。', tags: ['workspace', 'engineering', 'data'] },
  { id: 'stack', kind: 'layout', exportName: 'StackLayout', description: '纵向或横向顺序布局。', tags: ['layout', 'stack', 'container'] },
  { id: 'grid', kind: 'layout', exportName: 'GridLayout', description: '固定列或自适应栅格布局。', tags: ['layout', 'grid', 'responsive'] },
  { id: 'split', kind: 'layout', exportName: 'SplitLayout', description: '双区域分割布局。', tags: ['layout', 'split', 'workspace'] },
  { id: 'tabs', kind: 'layout', exportName: 'TabsLayout', description: '标签页容器布局。', tags: ['layout', 'tabs', 'container'] },
  { id: 'panel', kind: 'widget', exportName: 'PanelWidget', description: '可嵌套内容面板。', tags: ['widget', 'container'] },
  { id: 'text', kind: 'widget', exportName: 'TextWidget', description: '标题、正文和辅助文字。', tags: ['widget', 'typography'] },
  { id: 'button', kind: 'widget', exportName: 'ButtonWidget', description: '操作按钮视觉骨架。', tags: ['widget', 'action'] },
  { id: 'input', kind: 'widget', exportName: 'InputWidget', description: '文本输入控件骨架。', tags: ['widget', 'form'] },
  { id: 'select', kind: 'widget', exportName: 'SelectWidget', description: '选择控件骨架。', tags: ['widget', 'form'] },
  { id: 'metric', kind: 'widget', exportName: 'MetricWidget', description: '指标状态控件。', tags: ['widget', 'metric'] },
  { id: 'placeholder', kind: 'widget', exportName: 'PlaceholderWidget', description: '领域组件占位。', tags: ['widget', 'placeholder', 'domain'] }
] satisfies readonly UiCompositionCatalogEntry[]);

export function listFoundationUiCatalog(kind?: UiCompositionKind): readonly UiCompositionCatalogEntry[] {
  return kind ? foundationUiCatalog.filter((entry) => entry.kind === kind) : foundationUiCatalog;
}
