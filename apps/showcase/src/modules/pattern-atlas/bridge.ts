/** Only existing 0.21.0 Registry types. Not a new DSL or an editable Designer session. */
export interface CompositionNode {
  id: string;
  kind: 'layout' | 'widget';
  type: string;
  label?: string;
  props?: Record<string, unknown>;
  placement?: { span?: number };
  children?: CompositionNode[];
}

/** Bridge supports two intentionally conservative layouts; other patterns remain reference-only. */
export const compilableLayoutIds = ['bento', 'master-detail'] as const;
export function isCompilableLayout(id: string): boolean { return (compilableLayoutIds as readonly string[]).includes(id); }

export function buildCompositionSnippet(id: string): CompositionNode | undefined {
  if (id === 'bento') return {
    id: 'patternAtlasRoot', kind: 'layout', type: 'stack', props: { gap: 16 }, children: [
      { id: 'overviewTitle', kind: 'widget', type: 'text', props: { text: '项目概览', variant: 'title' } },
      { id: 'overviewGrid', kind: 'layout', type: 'grid', props: { columns: 3, gap: 12 }, children: [
        { id: 'featuredMetric', kind: 'widget', type: 'panel', props: { title: '重点指标' }, placement: { span: 2 }, children: [
          { id: 'featuredValue', kind: 'widget', type: 'metric', props: { label: '进展', value: '76%' } }
        ] },
        { id: 'taskCount', kind: 'widget', type: 'metric', props: { label: '进行中', value: 2 } },
        { id: 'completedCount', kind: 'widget', type: 'metric', props: { label: '已完成', value: 1 } },
        { id: 'keyTasks', kind: 'widget', type: 'panel', props: { title: '关键事项', description: '请替换为真实业务列表组件' }, placement: { span: 2 }, children: [
          { id: 'taskPlaceholder', kind: 'widget', type: 'placeholder', props: { title: '任务列表', description: '接入你的领域组件 / 数据源' } }
        ] }
      ] }
    ]
  };
  if (id === 'master-detail') return {
    id: 'patternAtlasRoot', kind: 'layout', type: 'stack', props: { gap: 16 }, children: [
      { id: 'workspaceTitle', kind: 'widget', type: 'text', props: { text: '对象工作台', variant: 'title' } },
      { id: 'workspaceSplit', kind: 'layout', type: 'split', props: { secondarySize: 320, gap: 16 }, children: [
        { id: 'masterList', kind: 'widget', type: 'panel', props: { title: '对象列表', description: '主要浏览与检索区域' }, children: [
          { id: 'listPlaceholder', kind: 'widget', type: 'placeholder', props: { title: '列表工作区', description: '请替换为表格、树或列表领域组件' } }
        ] },
        { id: 'detailInspector', kind: 'widget', type: 'panel', props: { title: '详细信息', description: '当前选中对象的属性与操作' }, children: [
          { id: 'detailPlaceholder', kind: 'widget', type: 'placeholder', props: { title: '详情面板', description: '补充选中状态与字段绑定' } }
        ] }
      ] }
    ]
  };
  return undefined;
}

export function serializeCompositionSnippet(id: string): string | undefined {
  const node = buildCompositionSnippet(id);
  return node ? `${JSON.stringify(node, null, 2)}\n` : undefined;
}
