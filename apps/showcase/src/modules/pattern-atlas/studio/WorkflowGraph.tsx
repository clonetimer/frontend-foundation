import type { WorkflowStep, WorkflowActionStep, WorkflowTrace } from './studio-workflows';

/** A read-only graph projection of the SAME declarative steps that the runtime executes.
 * Clicking a node opens its editable step below. No second workflow model is stored.
 */
export type WorkflowNodePhase = 'pending' | WorkflowTrace['phase'];
export interface WorkflowGraphState { phases: Readonly<Record<string, WorkflowNodePhase>>; hasRun: boolean }
export function workflowGraphState(traces: readonly WorkflowTrace[], sourceId: string): WorkflowGraphState {
  const events = traces.filter((entry) => entry.sourceId === sourceId);
  const latest = events.at(-1);
  const start = events.findLastIndex((entry) => entry.stepType === 'workflow' && entry.phase === 'start');
  // The trace buffer is bounded; long flows may evict their original start marker.
  const current = latest?.runId ? events.filter((entry) => entry.runId === latest.runId) : start < 0 ? [] : events.slice(start);
  const phases: Record<string, WorkflowNodePhase> = Object.create(null) as Record<string, WorkflowNodePhase>;
  for (const event of current) if (event.stepType !== 'workflow') phases[event.stepId] = event.phase;
  return { phases, hasRun: Boolean(latest?.runId) || start >= 0 };
}
export function workflowGraphSummary(step: WorkflowStep | WorkflowActionStep): string {
  switch (step.type) {
    case 'confirm': return step.text || '等待确认';
    case 'request': return `${step.method} · ${step.url || '未填写地址'}`;
    case 'save-record': return '保存表单记录';
    case 'refresh-records': return '重新读取列表';
    case 'notify': return step.text || '消息通知';
    case 'navigate': return `目标页面：${step.pageId || '未指定'}`;
    case 'emit': return `${step.action === 'focus' ? '聚焦' : '高亮'} ${step.targetId || '未指定组件'}`;
    case 'branch': return `${step.source} · ${step.operator}${step.operator === 'exists' ? '' : ` · ${step.expected}`}`;
  }
}
const names: Record<WorkflowStep['type'], string> = {
  confirm: '操作确认', request: 'HTTP 请求', 'save-record': '保存记录',
  'refresh-records': '刷新列表', notify: '显示提示', navigate: '切换页面',
  emit: '通知组件', branch: '条件判断'
};
const states: Record<WorkflowNodePhase, string> = {
  pending: '等待', start: '进行中', success: '成功', error: '失败',
  cancelled: '取消', completed: '完成', skipped: '未执行'
};
export function WorkflowGraph({ steps, traces, sourceId, onSelect }: {
  steps: readonly WorkflowStep[]; traces: readonly WorkflowTrace[];
  sourceId: string; onSelect: (index: number) => void;
}) {
  const { phases, hasRun } = workflowGraphState(traces, sourceId);
  const node = (step: WorkflowStep | WorkflowActionStep, index: number) => {
    const phase = phases[step.id] ?? 'pending';
    return <button type="button" className={`pa-studio-graph-node is-${phase}`} aria-label={`编辑${names[step.type]}：${workflowGraphSummary(step)}`} data-step-id={step.id} data-step-state={phase} onClick={() => onSelect(index)}>
      <span className="pa-studio-graph-node-title"><strong>{names[step.type]}</strong><span>{states[phase]}</span></span>
      <small title={workflowGraphSummary(step)}>{workflowGraphSummary(step)}</small>
    </button>;
  };
  if (!steps.length) return <div className="pa-studio-workflow-foot">添加流程步骤后，这里会显示节点与条件分支。</div>;
  return <section className="pa-studio-graph" aria-label="工作流节点概览">
    <div className="pa-studio-graph-heading"><strong>流程图</strong><span>{hasRun ? '本次执行状态' : '尚未运行'}</span></div>
    <div className="pa-studio-graph-start">开始</div>
    {steps.map((step, index) => <div className="pa-studio-graph-segment" key={step.id}>
      <div className="pa-studio-graph-connector" aria-hidden="true"/>
      {node(step, index)}
      {step.type === 'branch' ? <div className="pa-studio-graph-branches">
        {(['onTrue', 'onFalse'] as const).map((side) => <div key={side} className="pa-studio-graph-branch">
          <span className="pa-studio-graph-branch-label">{side === 'onTrue' ? '成立' : '不成立'}</span>
          {step[side].length ? step[side].map((action) => <div className="pa-studio-graph-child" key={action.id}><div className="pa-studio-graph-connector" aria-hidden="true"/>{node(action, index)}</div>) : <span className="pa-studio-graph-empty">无操作</span>}
        </div>)}
      </div> : null}
    </div>)}
    <div className="pa-studio-graph-connector" aria-hidden="true"/>
    <div className="pa-studio-graph-end">结束</div>
    <p className="pa-studio-workflow-foot">点击节点可定位下方编辑项；此图与导出代码使用同一份流程配置。</p>
  </section>;
}
