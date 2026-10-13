import { useState } from 'react';
import { Button, Drawer, Tag } from 'antd';
import { layoutVariants, sampleTasks, type SampleTask } from '../catalog';
import { isCompilableLayout } from '../bridge';

const statuses: SampleTask['status'][] = ['待开始', '进行中', '已完成'];
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const dateCells = Array.from({ length: 35 }, (_, index) => {
  const date = new Date(2026, 8, 28 + index);
  return { day: date.getDate(), inMonth: date.getMonth() === 9, key: `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')}` };
});

function TaskChip({ task, onClick }: { task: SampleTask; onClick: (task: SampleTask) => void }) {
  return <button type="button" className="pa-task-chip" onClick={() => onClick(task)}>
    <span className="pa-task-title">{task.title}</span><small>{task.id} · {task.owner}</small>
  </button>;
}

function TaskStatus({ status }: { status: SampleTask['status'] }) {
  return <Tag color={status === '已完成' ? 'success' : status === '进行中' ? 'processing' : 'default'}>{status}</Tag>;
}

export function VariantPreview({ id, onTask }: { id: string; onTask: (task: SampleTask) => void }) {
  const [focusId, setFocusId] = useState('T-102');
  const [ascending, setAscending] = useState(true);
  const focusTask = sampleTasks.find((task) => task.id === focusId) ?? sampleTasks[0];
  switch (id) {
    case 'bento':
      return <div className="pa-bento">
        <div className="pa-bento-lead"><span className="pa-kicker">项目概览 · ORBIT</span><strong>6 个任务正在推进</strong><p>从信息密度出发，先看到最重要的进展。</p><div className="pa-bento-stat"><b>67%</b><span>阶段完成度</span></div></div>
        <div className="pa-bento-statcard"><span>进行中</span><b>02</b><small>当前重点</small></div>
        <div className="pa-bento-statcard pa-mint"><span>已完成</span><b>01</b><small>继续保持节奏</small></div>
        <div className="pa-bento-tasks"><div className="pa-mini-head">关键任务 <span>点击查看 ↗</span></div>{sampleTasks.slice(1, 4).map((task) => <TaskChip key={task.id} task={task} onClick={onTask} />)}</div>
        <div className="pa-bento-quote">信息优先级决定面积，而不是每张卡片都一样大。<span>↗</span></div>
      </div>;
    case 'kanban':
      return <div className="pa-kanban">
        {statuses.map((status) => <div className="pa-kanban-column" key={status}><h4><i className={`pa-dot pa-dot-${status === '待开始' ? 'gray' : status === '进行中' ? 'blue' : 'green'}`} />{status}<span>{sampleTasks.filter((task) => task.status === status).length}</span></h4>
          {sampleTasks.filter((task) => task.status === status).map((task) => <TaskChip key={task.id} task={task} onClick={onTask} />)}
        </div>)}
      </div>;
    case 'timeline':
      return <div className="pa-timeline">{sampleTasks.map((task) => <button className="pa-timeline-row" type="button" key={task.id} onClick={() => onTask(task)}>
        <span className="pa-timeline-date">{task.date}</span><span className="pa-timeline-line"><i className={`pa-dot pa-dot-${task.status === '已完成' ? 'green' : task.status === '进行中' ? 'blue' : 'gray'}`} /></span><span className="pa-timeline-copy"><strong>{task.title}</strong><small>{task.owner} · {task.status}</small></span><span>↗</span>
      </button>)}</div>;
    case 'master-detail':
      return <div className="pa-master"><div className="pa-master-list"><div className="pa-mini-head">任务目录 <span>06</span></div>{sampleTasks.map((task) => <button className={focusId === task.id ? 'pa-master-item active' : 'pa-master-item'} key={task.id} type="button" onClick={() => setFocusId(task.id)}><strong>{task.title}</strong><small>{task.id} · {task.date}</small></button>)}</div><div className="pa-master-detail"><div className="pa-mini-head">详细信息 <span>{focusTask?.id}</span></div><h3>{focusTask?.title}</h3><p>点击左侧条目，右侧只更新详情，不丢失当前上下文。</p><TaskStatus status={focusTask?.status ?? '待开始'} /><dl><dt>负责人</dt><dd>{focusTask?.owner}</dd><dt>截止日期</dt><dd>{focusTask?.date}</dd><dt>优先级</dt><dd>{focusTask?.priority}</dd></dl><Button onClick={() => focusTask && onTask(focusTask)}>查看任务详情 →</Button></div></div>;
    case 'data-table':
      return <div className="pa-table-wrap"><table className="pa-table"><thead><tr><th>任务</th><th>状态</th><th>负责人</th><th><button type="button" onClick={() => setAscending(!ascending)} aria-label="按日期排序">截止日期 {ascending ? '↑' : '↓'}</button></th><th>操作</th></tr></thead><tbody>{[...sampleTasks].sort((a, b) => ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)).map((task) => <tr key={task.id}><td><strong>{task.title}</strong><small>{task.id}</small></td><td><TaskStatus status={task.status} /></td><td>{task.owner}</td><td>{task.date}</td><td><Button type="link" size="small" onClick={() => onTask(task)}>详情</Button></td></tr>)}</tbody></table></div>;
    case 'calendar':
      return <div className="pa-calendar"><div className="pa-calendar-head"><b>2026 年 10 月</b><span>同一批项目任务 · 月视图</span></div><div className="pa-calendar-grid">{weekdays.map((day) => <div className="pa-calendar-weekday" key={day}>周{day}</div>)}{dateCells.map((cell) => {
        const task = cell.inMonth ? sampleTasks.find((row) => row.date === cell.key) : undefined;
        return <div className={`pa-calendar-day${cell.inMonth ? '' : ' outside'}`} key={cell.key}><span>{cell.day}</span>{task ? <button type="button" title={task.title} onClick={() => onTask(task)}>{task.title}</button> : null}</div>;
      })}</div></div>;
    default: return null;
  }
}

export function ComparisonWorkbench({ onSelect, onExportComposition }: { onSelect: (id: string) => void; onExportComposition: (id: string) => void }) {
  const [variant, setVariant] = useState('bento');
  const [task, setTask] = useState<SampleTask | null>(null);
  const active = layoutVariants.find((entry) => entry.id === variant) ?? layoutVariants[0];
  return <section aria-label="同一数据的六种布局对比" className="pa-compare-workbench">
    <div className="pa-section-heading"><div><span className="pa-eyebrow">01 / LAYOUT LAB</span><h2>同一份任务，六种不同的界面</h2><p>先选信息结构，再谈颜色和动画。切换布局、点击任务，实际感受差别。</p></div><span className="pa-label-side">SAME DATA · DIFFERENT EXPERIENCE</span></div>
    <div className="pa-workbench-frame">
      <div className="pa-workbench-main"><div className="pa-workbench-head"><div className="pa-brand-mark">◈</div><div><strong>Orbit 项目协作</strong><small>同一份 6 条样例数据</small></div><span className="pa-live-chip">● LIVE PREVIEW</span></div>
        <div className="pa-variant-tabs" role="group" aria-label="选择布局方式">{layoutVariants.map((entry) => <button type="button" key={entry.id} aria-pressed={variant === entry.id} className={variant === entry.id ? 'active' : ''} onClick={() => setVariant(entry.id)}>{entry.label}</button>)}</div>
        <div className="pa-workbench-preview" key={variant}><VariantPreview id={variant} onTask={setTask}/></div>
      </div>
      <aside className="pa-workbench-aside"><div className="pa-eyebrow">LAYOUT INSIGHT</div><div className="pa-aside-ordinal">0{layoutVariants.findIndex((entry) => entry.id === variant) + 1}<span> / 06</span></div><h3>{active.label}</h3><p>{active.note}</p><div className="pa-aside-rule"/><strong>选择建议</strong><p>{variant === 'data-table' ? '适合精确对比、查找和批量操作的密集数据。' : variant === 'calendar' ? '日期是最核心的决策维度时更高效。' : variant === 'kanban' ? '状态流转比截止日期更重要时优先考虑。' : variant === 'bento' ? '适用于经营分析或项目首页的概览。' : variant === 'master-detail' ? '需要反复切换对象查看细节时最顺手。' : '事件先后与里程碑需要被清楚阅读。'}</p><div className="pa-bridge-actions"><Button type="primary" block onClick={() => onSelect(variant)}>＋ 加入我的方案</Button>{isCompilableLayout(variant) ? <Button block onClick={() => onExportComposition(variant)}>↓ 导出可编译 Composition</Button> : <small>该布局尚无可编译结构映射</small>}</div></aside>
    </div>
    <Drawer title="任务详情（示例）" open={task !== null} onClose={() => setTask(null)} width={420}><h3>{task?.title}</h3><p>编号：{task?.id}</p><p>负责人：{task?.owner}</p><p>预计日期：{task?.date}</p>{task ? <TaskStatus status={task.status} /> : null}<p style={{ marginTop: 24, color: '#778293' }}>同一份数据可以被不同布局复用，点击只打开轻量详情，不会改变项目源码。</p></Drawer>
  </section>;
}

/** Tiny layout thumbnails use CSS shapes, not screenshots or injected HTML. */
export function PatternThumbnail({ id }: { id: string }) {
  const types: Record<string, string> = {
    'master-detail': 'split', 'split-pane': 'split', sidebar: 'split', 'data-table': 'rows', 'expandable-table': 'rows',
    kanban: 'columns', 'chart-dashboard': 'chart', timeline: 'lines', 'notification-center': 'lines',
    calendar: 'calendar', heatmap: 'heatmap', comparison: 'columns', 'faceted-filter': 'rows',
    'stacked-cards': 'stack', carousel: 'stack', 'command-palette': 'search', 'inline-edit': 'rows', 'mega-menu': 'columns',
    graph: 'graph', funnel: 'funnel', progress: 'chart', 'range-slider': 'chart'
  };
  const kind = types[id] ?? 'bento';
  return <div className={`pa-thumb pa-thumb-${kind}`} aria-hidden="true"><span className="pa-thumb-header"><i/><i/><i/></span><div className="pa-thumb-art">{Array.from({ length: kind === 'heatmap' || kind === 'calendar' ? 20 : kind === 'lines' ? 4 : 5 }, (_, index) => <span key={index} />)}</div><div className="pa-thumb-mark">↗</div></div>;
}
