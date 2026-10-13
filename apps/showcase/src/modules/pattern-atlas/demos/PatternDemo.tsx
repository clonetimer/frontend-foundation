import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Alert, Badge, Button, Checkbox, Collapse, Drawer, Empty, Input, Modal, Popover, Progress, Segmented, Select, Skeleton, Slider, Space, Steps, Switch, Tag, message } from 'antd';
import { sampleTasks, type SampleTask } from '../catalog';
import { VariantPreview } from '../components/ComparisonWorkbench';

const workItems = ['梳理需求', '页面设计', '组件开发', '交互联调', '测试发布'];
const segmentModes = ['概览', '详情', '趋势'];
const options = ['工作台', '项目列表', '分析中心', '个人设置'];
const statuses: SampleTask['status'][] = ['待开始', '进行中', '已完成'];

function DemoPanel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="pa-demo-panel"><div className="pa-demo-panel-head"><span className="pa-dot pa-dot-green"/>{title}<span className="pa-demo-panel-right">INTERACTIVE</span></div><div className="pa-demo-panel-body">{children}</div></div>;
}
function Note({ children }: { children: ReactNode }) { return <p className="pa-demo-note">{children}</p>; }
function DemoButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={active ? 'pa-demo-choice active' : 'pa-demo-choice'}>{children}</button>;
}

function NativeKanban() {
  const [statusesById, setStatusesById] = useState<Record<string, SampleTask['status']>>(
    Object.fromEntries(sampleTasks.map(({ id, status }) => [id, status]))
  );
  const [taskId, setTaskId] = useState(sampleTasks[1]?.id ?? 'T-102');
  return <DemoPanel title="任务拖拽看板"><Note>拖动任务卡到另一列改变状态；也可以使用下面的选择框。</Note><div className="pa-mini-kanban">
    {statuses.map((status) => <div key={status} className="pa-mini-kanban-col" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); const id = event.dataTransfer.getData('text/plain');
      if (Object.prototype.hasOwnProperty.call(statusesById, id)) setStatusesById((prev) => ({ ...prev, [id]: status }));
    }}><strong>{status}</strong>{sampleTasks.filter((task) => statusesById[task.id] === status).map((task) => <button className="pa-draggable" type="button" draggable key={task.id} onClick={() => setTaskId(task.id)} onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}>{task.title}<small>{task.id}</small></button>)}</div>)}
  </div><div className="pa-demo-form-row"><span>选中任务：{sampleTasks.find((task) => task.id === taskId)?.title}</span><Select aria-label="更改任务状态" size="small" value={statusesById[taskId] ?? null} options={statuses.map((item) => ({ value: item, label: item }))} onChange={(value: SampleTask['status']) => setStatusesById((prev) => ({ ...prev, [taskId]: value }))}/></div></DemoPanel>;
}

function NativeDragSort() {
  const [items, setItems] = useState(workItems);
  return <DemoPanel title="拖拽排序"><Note>按住行拖动调整顺序；也支持上移/下移按钮。</Note><div className="pa-sort-list">{items.map((item, index) => <div className="pa-sort-item" key={item} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', item)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
    event.preventDefault(); const moving = event.dataTransfer.getData('text/plain');
    if (!items.includes(moving) || moving === item) return;
    const next = items.filter((x) => x !== moving); next.splice(index, 0, moving); setItems(next);
  }}><span aria-hidden="true">⠿</span><strong>{item}</strong><span className="pa-grow"/><Button size="small" disabled={index === 0} aria-label={`${item}上移`} onClick={() => setItems((prev) => { const next = [...prev]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; return next; })}>↑</Button><Button size="small" disabled={index === items.length - 1} aria-label={`${item}下移`} onClick={() => setItems((prev) => { const next = [...prev]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; return next; })}>↓</Button></div>)}</div></DemoPanel>;
}

function DemoGraph() {
  const nodes = [{ label: '用户研究', x: 50, y: 50 }, { label: '需求定义', x: 25, y: 21 }, { label: '交互设计', x: 78, y: 24 }, { label: '组件开发', x: 77, y: 76 }, { label: '测试反馈', x: 25, y: 80 }];
  const [focus, setFocus] = useState(0);
  return <DemoPanel title="关系节点网络"><Note>点击节点切换焦点。连线表达关联，而非顺序。</Note><div className="pa-graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{nodes.slice(1).map((node) => <line key={node.label} x1="50" y1="50" x2={node.x} y2={node.y} stroke="#b3c5c4" strokeWidth="0.7" strokeDasharray="2 1" />)}</svg>{nodes.map((node, index) => <button key={node.label} type="button" style={{ left: `${node.x}%`, top: `${node.y}%` }} className={focus === index ? 'pa-node active' : 'pa-node'} onClick={() => setFocus(index)}>{node.label}</button>)}</div><Alert type="info" showIcon message={`当前焦点：${nodes[focus]?.label}`} /></DemoPanel>;
}

/** React/TypeScript-native demonstration surface. No iframe, innerHTML, script injection or new packages. */
export function PatternDemo({ id }: { id: string }) {
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('Orbit 项目计划');
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [slider, setSlider] = useState(42);
  const [secondSlider, setSecondSlider] = useState(75);
  const [toggle, setToggle] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tableRows, setTableRows] = useState(['设计规范', '任务分工', '交付文档']);
  const [toast, contextHolder] = message.useMessage();
  useEffect(() => {
    if (id !== 'command-palette') return;
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActive(0);
        setSearch('');
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [id]);
  const next = () => setActive((prev) => (prev + 1) % workItems.length);
  const check = (value: string) => setSelected((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]);

  if (['bento', 'master-detail', 'kanban', 'timeline', 'data-table', 'calendar'].includes(id)) {
    return id === 'kanban' ? <NativeKanban/> : <DemoPanel title="可点击布局预览"><VariantPreview id={id} onTask={(task) => { setText(task.title); setOpen(true); }} /><Drawer open={open} onClose={() => setOpen(false)} title="任务信息" width={340}><p>{text}</p><Note>此演示使用示例数据，不会写入你的项目。</Note></Drawer></DemoPanel>;
  }
  if (id === 'dragdrop') return <NativeDragSort/>;
  if (id === 'graph') return <DemoGraph/>;

  switch (id) {
    case 'masonry':
      return <DemoPanel title="灵感素材墙"><Note>卡片高度不同，点击可聚焦选中的内容。</Note><div className="pa-masonry">{['日常灵感', '品牌规范', '产品草图', '创意概念', '内容灵感', '交互动效'].map((name, index) => <button type="button" key={name} onClick={() => setActive(index)} className={`pa-masonry-tile pa-masonry-tile-${index % 3}${active === index ? ' active' : ''}`}><span>{name}</span><small>{index + 1 < 10 ? `0${index + 1}` : index + 1}</small></button>)}</div><Note>当前聚焦：{['日常灵感', '品牌规范', '产品草图', '创意概念', '内容灵感', '交互动效'][active]}</Note></DemoPanel>;
    case 'split-pane':
      return <DemoPanel title="可调工作区"><Note>拖动滑块来改变左右工作面板宽度。</Note><div className="pa-split-preview"><div style={{ width: `${slider}%` }}><strong>文档目录</strong><p>项目背景</p><p>需求目标</p><p>验收标准</p></div><div style={{ flex: 1 }}><strong>正在编辑</strong><h4>设计概要</h4><p>一边参考，一边完成当前任务。</p></div></div><Slider aria-label="左侧面板宽度" value={slider} min={25} max={65} onChange={(value) => { if (typeof value === "number") setSlider(value); }}/><Note>左侧面板：{slider}%</Note></DemoPanel>;
    case 'comparison':
      return <DemoPanel title="方案差异对齐"><div className="pa-compare-plans">{['方案 A · 轻量', '方案 B · 完整'].map((name, index) => <button type="button" key={name} className={active === index ? 'pa-plan selected' : 'pa-plan'} onClick={() => setActive(index)}><small>{index ? '更多能力' : '快速上线'}</small><h3>{name}</h3><div>✔ 响应式布局</div><div>✔ 搜索和筛选</div><div>{index ? '✔ 自定义工作流' : '— 自定义工作流'}</div><strong>{active === index ? '✓ 已选择' : '选择方案'}</strong></button>)}</div></DemoPanel>;
    case 'stacked-cards':
      return <DemoPanel title="聚焦阅读的卡片栈"><div className="pa-stack-scene"><div className="pa-stack-back one"/><div className="pa-stack-back two"/><div className="pa-stack-front"><small>IDEA 0{active + 1} / 05</small><h2>{workItems[active]}</h2><p>一次聚焦一件事，减少同时出现的信息。</p></div></div><Space><Button onClick={() => setActive((active + 4) % 5)}>← 上一张</Button><Button type="primary" onClick={next}>下一张 →</Button></Space></DemoPanel>;
    case 'sidebar':
      return <DemoPanel title="稳定的侧边导航"><div className="pa-demo-sidebar"><div className="pa-demo-sidebar-nav"><strong>◈ ORBIT</strong>{options.map((name, index) => <DemoButton key={name} active={index === active} onClick={() => setActive(index)}>{name}</DemoButton>)}</div><div className="pa-demo-sidebar-content"><span>工作区 / {options[active]}</span><h3>{options[active]}</h3><p>导航切换后，主内容区只展示对应模块。</p></div></div></DemoPanel>;
    case 'tabs':
      return <DemoPanel title="平级内容分组"><div className="pa-demo-tabbar" role="tablist" aria-label="内容分类">{segmentModes.map((name, index) => <button type="button" role="tab" aria-selected={active === index} key={name} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>{name}</button>)}</div><div className="pa-demo-tabbody" role="tabpanel"><h3>{segmentModes[active]}</h3><p>{['最关键的信息放在第一个面板，其他内容按需查看。', '这里放当前对象的字段和操作。', '这里放时间变化、关键指标和异常。'][active]}</p></div></DemoPanel>;
    case 'breadcrumb':
      return <DemoPanel title="分层路径导航"><div className="pa-breadcrumb">{['工作空间', '项目管理', 'Orbit', '需求文档'].slice(0, active + 2).map((name, index) => <span key={name}><button type="button" onClick={() => setActive(Math.max(0, index - 1))}>{name}</button><b>/</b></span>)}</div><div className="pa-demo-tabbody"><h3>{['项目管理', 'Orbit', '需求文档'][active]}</h3><p>点击上级目录可以返回，不需要通过浏览器后退来找路径。</p></div><Button onClick={() => setActive((active + 1) % 3)}>进入下一层 →</Button></DemoPanel>;
    case 'mega-menu':
      return <DemoPanel title="多栏目超级菜单"><div className="pa-demo-form-row"><Popover trigger="click" open={open} onOpenChange={setOpen} placement="bottomLeft" content={<div className="pa-mega"><div><strong>设计</strong><p>组件库</p><p>模式图鉴</p><p>交互规范</p></div><div><strong>开发</strong><p>工程模板</p><p>API 文档</p><p>代码规范</p></div><div><strong>资源</strong><p>设计素材</p><p>教程</p><p>支持中心</p></div></div>}><Button type="primary">探索所有产品 ▾</Button></Popover><Note>点击菜单后可浏览按主题分组的入口。</Note></div></DemoPanel>;
    case 'command-palette':
      return <DemoPanel title="命令面板"><Space direction="vertical" style={{ width: '100%' }}><Button onClick={() => { setSearch(''); setOpen(true); }}>⌘K / Ctrl+K · 搜索所有功能</Button><Modal open={open} footer={null} title="快速打开" onCancel={() => setOpen(false)}><Input autoFocus allowClear value={search} placeholder="输入项目、分析、设置…" onChange={(event) => { setActive(0); setSearch(event.target.value); }} onKeyDown={(event) => {
        const matches = options.filter((item) => item.includes(search));
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive((old) => (old + 1) % Math.max(matches.length, 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive((old) => (old + Math.max(matches.length, 1) - 1) % Math.max(matches.length, 1)); }
        if (event.key === 'Enter' && matches[active]) { setText(matches[active]); setOpen(false); }
      }}/><div className="pa-command-options">{options.filter((item) => item.includes(search)).map((item, index) => <button type="button" key={item} className={index === active ? 'active' : ''} onClick={() => { setText(item); setOpen(false); }}>↗ {item}</button>)}</div></Modal><Note>上次打开：{text === 'Orbit 项目计划' ? '尚未选择命令' : text}</Note></Space></DemoPanel>;
    case 'dock':
      return <DemoPanel title="常用工具 Dock"><div className="pa-dock-workspace"><h3>{options[active]}</h3><p>只保留四个高频入口，减少主导航负担。</p><div className="pa-dock">{['⌂', '▤', '◴', '⚙'].map((symbol, index) => <button type="button" key={symbol} title={options[index]} aria-label={options[index]} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>{symbol}</button>)}</div></div></DemoPanel>;
    case 'stepper':
      return <DemoPanel title="步骤进度导航"><Steps size="small" current={active % 3} items={[{ title: '基本信息' }, { title: '配置选项' }, { title: '确认' }]}/><div className="pa-demo-tabbody"><h3>第 {active % 3 + 1} / 3 步</h3><p>{['录入项目资料', '设置默认权限和选项', '核对内容后提交'][active % 3]}</p></div><Space><Button disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>上一步</Button><Button type="primary" onClick={() => setActive((value) => (value + 1) % 3)}>{active % 3 === 2 ? '重新开始' : '下一步'}</Button></Space></DemoPanel>;
    case 'chart-dashboard':
      return <DemoPanel title="数据分析工作台"><div className="pa-chart-kpis"><div><small>本周访问</small><strong>{toggle ? '12,980' : '7,482'}</strong><span>↗ 12.8%</span></div><div><small>新增用户</small><strong>{toggle ? '1,306' : '842'}</strong><span>↗ 8.2%</span></div><div><small>转化率</small><strong>{toggle ? '18.2%' : '14.6%'}</strong><span>↗ 3.6%</span></div></div><div className="pa-demo-form-row"><strong>访问趋势</strong><Segmented value={toggle ? '本月' : '本周'} options={['本周', '本月']} onChange={(value) => setToggle(value === '本月')}/></div><div className="pa-chart-bars">{[34, 66, 47, 75, 62, 94, 84].map((height, index) => <button type="button" aria-label={`第 ${index + 1} 组值 ${height}`} title={`第 ${index + 1} 组 · ${height}`} key={index} className={active === index ? 'active' : ''} onClick={() => setActive(index)} style={{ '--bar-height': `${height * (toggle ? .8 : 1)}%` } as CSSProperties}><span/></button>)}</div><Note>选中第 {active + 1} 个数据点，数值 {[34, 66, 47, 75, 62, 94, 84][active]}（示意）。</Note></DemoPanel>;
    case 'heatmap':
      return <DemoPanel title="活跃热力矩阵"><Note>点击格子查看强度，颜色越深表示频次越高。</Note><div className="pa-heatmap">{Array.from({ length: 84 }, (_, index) => { const value = (index * 7 + Math.floor(index / 6) * 3) % 5; return <button type="button" key={index} aria-label={`第 ${index + 1} 天，活跃度 ${value}`} title={`活跃 ${value} 次`} className={`pa-heat pa-heat-${value}${index === active ? ' selected' : ''}`} onClick={() => setActive(index)} />; })}</div><div className="pa-demo-form-row"><span>选中：第 {active + 1} 格 / {((active * 7 + Math.floor(active / 6) * 3) % 5)} 次</span><span>少 <i className="pa-heat pa-heat-0"/> <i className="pa-heat pa-heat-2"/> <i className="pa-heat pa-heat-4"/> 多</span></div></DemoPanel>;
    case 'funnel':
      return <DemoPanel title="漏斗阶段分析"><Note>点击阶段查看流失位置与转化表现（数据为示意）。</Note><div className="pa-funnel">{[{ name: '页面曝光', count: '10,000', width: 100 }, { name: '进入详情', count: '6,400', width: 80 }, { name: '提交表单', count: '2,800', width: 60 }, { name: '完成转化', count: '1,260', width: 42 }].map((step, index) => <button key={step.name} type="button" style={{ width: `${step.width}%` }} onClick={() => setActive(index)} className={index === active ? 'active' : ''}><strong>{step.name}</strong><span>{step.count}</span></button>)}</div><Note>当前阶段：{['页面曝光', '进入详情', '提交表单', '完成转化'][active % 4]}</Note></DemoPanel>;
    case 'carousel':
      return <DemoPanel title="精选内容画廊"><div className="pa-carousel"><Button aria-label="上一张" onClick={() => setActive((value) => (value + 3) % 4)}>←</Button><div className={`pa-carousel-slide pa-carousel-slide-${active % 4}`}><span>FEATURED 0{active % 4 + 1}</span><h2>{['设计基座', '工作流', '数据产品', '品牌语言'][active % 4]}</h2><p>一次只展示一个精选主题。</p></div><Button aria-label="下一张" onClick={() => setActive((value) => (value + 1) % 4)}>→</Button></div><div className="pa-carousel-dots" role="group" aria-label="选择轮播项目">{[0, 1, 2, 3].map((n) => <button type="button" key={n} className={active % 4 === n ? 'active' : ''} onClick={() => setActive(n)} aria-label={`转到第 ${n + 1} 张`}/>)}</div></DemoPanel>;
    case 'expandable-table':
      return <DemoPanel title="展开查看行详情"><table className="pa-demo-expand"><thead><tr><th>项目名称</th><th>负责人</th><th>详情</th></tr></thead><tbody>{sampleTasks.slice(0, 4).map((item, index) => <FragmentRow key={item.id} item={item} expanded={active === index && visible} onClick={() => { setActive(index); setVisible((before) => active === index ? !before : true); }}/>)}</tbody></table></DemoPanel>;
    case 'modal':
      return <DemoPanel title="聚焦当前决定"><div className="pa-demo-centered"><h3>发布前最终确认</h3><p>关键操作使用显式确认，防止误触。</p><Button type="primary" onClick={() => setOpen(true)}>发布新版本</Button><Modal title="确认发布" open={open} onCancel={() => setOpen(false)} onOk={() => { setOpen(false); void toast.success('示例发布成功'); }} okText="确认发布" cancelText="取消"><p>是否发布当前版本？此操作仅用于界面演示。</p></Modal></div>{contextHolder}</DemoPanel>;
    case 'drawer':
      return <DemoPanel title="侧边查看上下文"><div className="pa-demo-centered"><h3>当前任务：需求梳理</h3><p>保持主列表不变，仅从右侧打开详情。</p><Button type="primary" onClick={() => setOpen(true)}>打开详情抽屉 →</Button></div><Drawer title="需求梳理 · 详情" width={360} open={open} onClose={() => setOpen(false)}><h3>需求梳理</h3><p>负责人：林然</p><p>状态：进行中</p><Input.TextArea rows={3} defaultValue="在主列表上方保持上下文，减少跳转"/><Button style={{ marginTop: 12 }} onClick={() => { setOpen(false); void toast.success('示例内容已保存'); }}>保存并关闭</Button></Drawer>{contextHolder}</DemoPanel>;
    case 'accordion':
      return <DemoPanel title="渐进式展开"><Collapse defaultActiveKey={['0']} items={['基础设置', '高级配置', '安全与权限', '常见问题'].map((name, index) => ({ key: String(index), label: name, children: <p>{['基础内容默认可见，避免一打开就是长表单。', '只在需要时展示高级选项。', '权限配置属于相对独立的区域。', '按主题阅读，而不是一次看完所有信息。'][index]}</p> }))}/></DemoPanel>;
    case 'popover':
      return <DemoPanel title="轻量锚点信息"><div className="pa-demo-centered"><h3>项目可见性 <Popover trigger="click" title="关于可见性" content={<div style={{ maxWidth: 225 }}>只有拥有项目权限的成员才能看到当前工作区及其内容。</div>}><Button size="small" aria-label="查看可见性说明">ⓘ 帮助</Button></Popover></h3><p>短说明无需新开页面或全屏弹窗。</p><Popover placement="bottom" trigger="click" content={<Space direction="vertical"><Checkbox defaultChecked>邮件通知</Checkbox><Checkbox>仅显示重要消息</Checkbox></Space>}><Button>打开快捷设置 ▾</Button></Popover></div></DemoPanel>;
    case 'inline-edit':
      return <DemoPanel title="点击即可就地编辑"><div className="pa-demo-inline-edit"><span>项目名称</span>{editing ? <Space.Compact style={{ width: '100%' }}><Input value={text} autoFocus onChange={(event) => setText(event.target.value)} onPressEnter={() => setEditing(false)}/><Button type="primary" onClick={() => setEditing(false)}>保存</Button></Space.Compact> : <button type="button" onClick={() => setEditing(true)}><strong>{text || '未命名项目'}</strong> ✎</button>}</div><Note>{editing ? '回车或点击保存，演示仅修改当前组件状态。' : '点击名称进入编辑态，无需跳转到设置页面。'}</Note></DemoPanel>;
    case 'toast':
      return <DemoPanel title="操作后轻提示"><div className="pa-demo-centered"><h3>试试不同的反馈状态</h3><Space wrap><Button onClick={() => void toast.success('保存成功')}>✓ 成功</Button><Button onClick={() => void toast.info('新版本正在检查')}>ⓘ 信息</Button><Button danger onClick={() => void toast.error('示例请求失败，请重试')}>✕ 失败</Button></Space></div>{contextHolder}</DemoPanel>;
    case 'wizard':
      return <DemoPanel title="分步完成输入"><Steps size="small" current={Math.min(active, 2)} items={[{ title: '信息' }, { title: '偏好' }, { title: '完成' }]}/><div className="pa-demo-tabbody">{active === 0 ? <><label htmlFor="pa-wizard-project">项目名称</label><Input id="pa-wizard-project" value={text} onChange={(event) => setText(event.target.value)}/></> : active === 1 ? <><span>开启消息提醒</span><Switch checked={toggle} onChange={setToggle}/></> : <Alert type="success" message="设置完成" description={`项目：${text || '未命名'}；提醒：${toggle ? '已开启' : '关闭'}`}/>}</div><Space><Button disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>返回</Button><Button type="primary" disabled={active === 0 && !text.trim()} onClick={() => setActive((value) => (value + 1) % 3)}>{active === 2 ? '重新填写' : '继续'}</Button></Space></DemoPanel>;
    case 'faceted-filter':
      return <DemoPanel title="多维筛选工作区"><div className="pa-facet-filters"><Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务名称..."/><div><strong>状态</strong><Checkbox.Group options={statuses} value={selected} onChange={(values) => setSelected(values.map(String))}/></div></div><div className="pa-facet-results">{sampleTasks.filter((item) => item.title.includes(search) && (!selected.length || selected.includes(item.status))).map((item) => <div key={item.id}><strong>{item.title}</strong><Tag>{item.status}</Tag></div>)}{sampleTasks.filter((item) => item.title.includes(search) && (!selected.length || selected.includes(item.status))).length === 0 ? <Empty description="没有匹配的任务"/> : null}</div></DemoPanel>;
    case 'segmented-control':
      return <DemoPanel title="短列表单选切换"><Segmented block options={segmentModes} value={segmentModes[active % 3]} onChange={(value) => setActive(segmentModes.indexOf(String(value)))}/><div className="pa-demo-tabbody"><h3>{segmentModes[active % 3]}</h3><p>无需打开下拉框就可以切换少量平级选项。</p></div></DemoPanel>;
    case 'range-slider':
      return <DemoPanel title="区间快速设定"><div className="pa-demo-form-row"><strong>预算范围</strong><Tag color="blue">¥{slider * 100} – ¥{secondSlider * 100}</Tag></div><Slider range min={0} max={100} step={5} value={[Math.min(slider, secondSlider), Math.max(slider, secondSlider)]} onChange={(values) => { if (Array.isArray(values)) { setSlider(values[0] ?? 0); setSecondSlider(values[1] ?? 100); } }}/><Note>滑动范围端点，快速调整最大和最小值。</Note></DemoPanel>;
    case 'empty-state':
      return <DemoPanel title="空白内容引导">{tableRows.length === 0 ? <div className="pa-demo-centered"><Empty description="暂无项目，创建第一个吧"/><Button type="primary" onClick={() => setTableRows(['我的第一个项目'])}>＋ 创建项目</Button></div> : <div className="pa-demo-centered"><Alert type="success" showIcon message={`已有 ${tableRows.length} 个示例项目`} /><Button danger onClick={() => setTableRows([])}>清空项目，查看空状态</Button></div>}</DemoPanel>;
    case 'skeleton':
      return <DemoPanel title="加载占位骨架"><div className="pa-demo-form-row"><span>{toggle ? '内容已加载' : '正在加载示意'}</span><Switch checked={toggle} onChange={setToggle} checkedChildren="内容" unCheckedChildren="骨架"/></div>{toggle ? <div className="pa-demo-tabbody"><h3>已加载的工作台</h3><p>骨架被真实内容替换，避免突兀跳动。</p></div> : <Skeleton active paragraph={{ rows: 4 }} title avatar/>}</DemoPanel>;
    case 'progress':
      return <DemoPanel title="任务进度反馈"><Progress percent={slider} status={slider === 100 ? 'success' : 'active'}/><div className="pa-demo-form-row"><strong>{slider === 100 ? '任务已完成' : '资源处理中…'}</strong><Space><Button onClick={() => setSlider(0)}>重置</Button><Button type="primary" onClick={() => setSlider((value) => Math.min(100, value + 20))} disabled={slider >= 100}>推进 +20%</Button></Space></div><Note>真实任务应连接异步任务状态；这里仅模拟进度。</Note></DemoPanel>;
    case 'notification-center':
      return <DemoPanel title="集中查看消息"><div className="pa-demo-form-row"><strong>消息中心</strong><Badge count={3 - selected.length} size="small"/><Button size="small" onClick={() => setSelected(['消息 1', '消息 2', '消息 3'])}>全部设为已读</Button></div><div className="pa-notification-list">{['项目文档已更新', '任务分配给了你', '新一轮测试已完成'].map((name, index) => <button type="button" key={name} onClick={() => check(`消息 ${index + 1}`)} className={selected.includes(`消息 ${index + 1}`) ? 'read' : ''}><span className="pa-dot pa-dot-blue"/><span><strong>{name}</strong><small>{index + 1} 小时前 · 点击切换已读</small></span>{!selected.includes(`消息 ${index + 1}`) ? <Badge status="processing"/> : <span>✓</span>}</button>)}</div></DemoPanel>;
    default:
      return <DemoPanel title="模式说明"><Alert message="当前模式暂未提供独立演示" type="info"/></DemoPanel>;
  }
}

function FragmentRow({ item, expanded, onClick }: { item: SampleTask; expanded: boolean; onClick: () => void }) {
  return <><tr><td>{item.title}</td><td>{item.owner}</td><td><Button size="small" aria-expanded={expanded} onClick={onClick}>{expanded ? '收起 −' : '展开 +'}</Button></td></tr>{expanded ? <tr className="pa-expanded-row"><td colSpan={3}>编号：{item.id} 状态：{item.status} 预计日期：{item.date}。这是与当前行关联的补充信息。</td></tr> : null}</>;
}
