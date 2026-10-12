import { useEffect, useMemo, useState } from 'react';
import { Button, Divider, Drawer, Empty, Input, Modal, Select, Tag, Tooltip, message } from 'antd';
import { Page, PageContent } from '@foundation/ui';
import { Link } from 'react-router';
import { categories, filterPatterns, getPattern, layoutVariants, patterns, type CategoryId } from '../catalog';
import { ComparisonWorkbench, PatternThumbnail } from '../components/ComparisonWorkbench';
import { PatternDemo } from '../demos/PatternDemo';
import { generatePatternPrompt, type VisualStyle } from '../prompt';
import { readDesignConfig, readSelectedEffects } from '../effects/config';
import { effectById } from '../effects/catalog';
import { serializeCompositionSnippet } from '../bridge';
import { readStoredPatternIds, saveStoredPatternIds, readStoredPlanDraft, saveStoredPlanDraft } from '../storage';
import '../styles.css';

const templates = [
  { title: '团队协作', subtitle: '跨状态的任务追踪', ids: ['kanban', 'drawer', 'dragdrop', 'toast'] },
  { title: '管理工作台', subtitle: '高密度数据与详情', ids: ['master-detail', 'data-table', 'faceted-filter', 'empty-state'] },
  { title: '内容探索', subtitle: '视觉素材与内容浏览', ids: ['bento', 'masonry', 'carousel', 'modal'] },
  { title: '运营分析', subtitle: '趋势、转化与时间', ids: ['chart-dashboard', 'funnel', 'segmented-control', 'skeleton'] }
];

function jumpTo(id: string): void { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function toggleId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export function Component() {
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStoredPatternIds('favorites'));
  const [selected, setSelected] = useState<string[]>(() => readStoredPatternIds('selected'));
  const [effectSelections] = useState(readSelectedEffects);
  const [designConfig] = useState(readDesignConfig);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [demoResetKey, setDemoResetKey] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);
  const [initialDraft] = useState(readStoredPlanDraft);
  const [projectName, setProjectName] = useState(initialDraft.projectName ?? '项目管理工作台');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>(initialDraft.style ?? '简洁专业');
  const [stack, setStack] = useState(initialDraft.stack ?? 'React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）');
  const [notes, setNotes] = useState(initialDraft.notes ?? '保留现有 Frontend Foundation 0.21.0 架构；先只调整独立业务模块，不扩展冻结的 Blueprint / Designer DSL。');
  const [customPrompt, setCustomPrompt] = useState('');
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => { saveStoredPatternIds('favorites', favorites); }, [favorites]);
  useEffect(() => { saveStoredPatternIds('selected', selected); }, [selected]);
  useEffect(() => { saveStoredPlanDraft({ projectName, style: visualStyle, stack, notes }); }, [projectName, visualStyle, stack, notes]);
  const results = useMemo(() => filterPatterns({ search, category, favoritesOnly, favorites }), [search, category, favoritesOnly, favorites]);
  const detail = detailId ? getPattern(detailId) : undefined;
  const suggestedPrompt = useMemo(() => generatePatternPrompt({ projectName, style: visualStyle, stack, selectedIds: selected, effectIds: effectSelections, design: designConfig, notes }), [projectName, visualStyle, stack, selected, effectSelections, designConfig, notes]);
  useEffect(() => { setCustomPrompt(suggestedPrompt); }, [suggestedPrompt]);
  const selectedPatterns = selected.map(getPattern).filter((pattern) => pattern !== undefined);
  const addToPlan = (id: string) => setSelected((previous) => previous.includes(id) ? previous : [...previous, id]);
  const toggleFavorite = (id: string) => setFavorites((previous) => toggleId(previous, id));
  const selectTemplate = (ids: string[]) => {
    setSelected((previous) => [...new Set([...previous, ...ids])]);
    void messageApi.success('已加入示例组合，可以继续增删形式');
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(customPrompt); void messageApi.success('提示词已复制'); }
    catch { void messageApi.warning('浏览器限制了自动复制，请在文本框内全选并复制'); }
  };
  const exportComposition = (id: string) => {
    const snippet = serializeCompositionSnippet(id);
    if (!snippet) { void messageApi.warning('该布局目前没有可编译的 Composition 骨架'); return; }
    const blob = new Blob([snippet], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a'); element.href = url; element.download = `foundation-composition-${id}.json`; element.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    void messageApi.success('已下载 Composition JSON；需放入目标 page.composition 并检查业务绑定');
  };
  const downloadPrompt = () => {
    const blob = new Blob([customPrompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a'); element.href = url; element.download = 'pattern-atlas-需求描述.txt'; element.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <Page><PageContent><div className="pa-app">
    {contextHolder}
    <div className="pa-topline"><div className="pa-logo"><span className="pa-logo-box">◈</span><div><strong>PATTERN ATLAS</strong><small>Frontend Foundation · 交互形式图鉴</small></div></div><div className="pa-header-links"><button type="button" onClick={() => jumpTo('pa-compare')}>布局实验室</button><button type="button" onClick={() => jumpTo('pa-gallery')}>形式图鉴</button><Link to="/patterns/effects"><Button>✦ 特效实验室</Button></Link><Link to="/studio"><Button>拖拽设计</Button></Link><Link to="/create"><Button type="primary">创建页面 →</Button></Link><Button type="primary" onClick={() => setPromptOpen(true)}>选型说明（可选） <span className="pa-count-pill">{selected.length}</span> ↗</Button></div></div>

    <section className="pa-hero"><div className="pa-hero-copy"><div className="pa-hero-pill"><span>✦</span> DESIGN SYSTEM / EXPLORATION 01</div><h1>别再让界面<br/>只会<span>卡片平铺。</span></h1><p>先看清布局，再体验交互，然后创建可编辑的项目页面；需要时再交给 AI。选择形式之后可以创建真实的项目页面，在统一设计器中继续编辑。</p><div className="pa-hero-actions"><Button size="large" className="pa-hero-primary" onClick={() => jumpTo('pa-compare')}>先比较六种布局 ↗</Button><Button size="large" className="pa-hero-secondary" onClick={() => jumpTo('pa-gallery')}>探索全部 {patterns.length} 种形式 →</Button></div></div><div className="pa-hero-illustration" aria-hidden="true"><span className="pa-orbit pa-orbit-one"/><span className="pa-orbit pa-orbit-two"/><div className="pa-faux-window pa-faux-back"><div><i/><i/><i/> WORKSPACE / OVERVIEW</div><section><b/><b/><b/><b/></section></div><div className="pa-faux-window pa-faux-front"><div><i/><i/><i/> PROJECT / FLOW</div><section><article><strong>TODO</strong><b/><b/></article><article><strong>DOING</strong><b/><b/><b/></article><article><strong>DONE</strong><b/></article></section></div><span className="pa-faux-tag">✦ MAKE IT INTERACTIVE</span></div></section>
    <div className="pa-stats"><div><strong>{patterns.length}</strong><span>种可探索形式</span></div><div><strong>{categories.length - 1}</strong><span>大设计维度</span></div><div><strong>{layoutVariants.length}</strong><span>种同数据布局对比</span></div><div className="pa-stats-tip"><Link to="/patterns/effects">已选 {effectSelections.length} 种特效 · 去特效实验室 ↗</Link><span> · </span><Link to="/patterns/config">设计配置中心 ↗</Link><span> · </span><Link to="/create">创建项目页面 ↗</Link><span> · </span><Link to="/records/pilot">业务试点 ↗</Link></div></div>

    <div id="pa-compare" className="pa-anchor"><ComparisonWorkbench onSelect={(id) => { addToPlan(id); void messageApi.success('已加入我的方案'); }} onExportComposition={exportComposition}/></div>

    <section className="pa-scenarios"><div className="pa-section-heading"><div><span className="pa-eyebrow">02 / START WITH A GOAL</span><h2>先有场景，再挑形式</h2><p>这些是可拆解的参考组合，不必照单全收。</p></div></div><div className="pa-scenario-grid">{templates.map((template, index) => <button type="button" key={template.title} className="pa-scenario-card" onClick={() => selectTemplate(template.ids)}><span className="pa-scenario-icon">{['⌁', '▤', '◈', '◫'][index]}</span><strong>{template.title}</strong><small>{template.subtitle}</small><span>＋ 加入组合 ↗</span></button>)}</div></section>

    <section id="pa-gallery" className="pa-gallery"><div className="pa-section-heading"><div><span className="pa-eyebrow">03 / THE PATTERN LIBRARY</span><h2>把交互形式变成自己的工具箱</h2><p>搜索名称或使用场景，打开每个模式的 React 交互演示，再决定要不要加入方案。</p></div><div className="pa-results-counter"><strong>{results.length}</strong><span>种形式</span></div></div>
      <div className="pa-gallery-filter"><div className="pa-category-list" role="group" aria-label="模式分类">{categories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><span>{item.icon}</span>{item.name}</button>)}</div><div className="pa-filter-search"><Input aria-label="搜索交互形式" placeholder="搜索布局 / 交互 / 场景…" allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix="⌕"/><Tooltip title="只显示收藏"><Button onClick={() => setFavoritesOnly((old) => !old)} type={favoritesOnly ? 'primary' : 'default'} aria-pressed={favoritesOnly}>♡ 收藏</Button></Tooltip></div></div>
      {results.length ? <div className="pa-pattern-grid">{results.map((pattern, index) => <article className="pa-pattern-card" key={pattern.id}><div className="pa-pattern-visual" role="button" tabIndex={0} aria-label={`查看 ${pattern.title} 的交互演示`} onClick={() => { setDetailId(pattern.id); setDemoResetKey(0); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailId(pattern.id); setDemoResetKey(0); } }}><PatternThumbnail id={pattern.id} /><span className="pa-pattern-index">{String(index + 1).padStart(2, '0')}</span></div><div className="pa-pattern-body"><div className="pa-pattern-meta"><span>{categories.find((item) => item.id === pattern.cat)?.name}</span><button type="button" title={favorites.includes(pattern.id) ? '取消收藏' : '收藏'} aria-label={favorites.includes(pattern.id) ? `取消收藏 ${pattern.title}` : `收藏 ${pattern.title}`} aria-pressed={favorites.includes(pattern.id)} className={favorites.includes(pattern.id) ? 'pa-favorite active' : 'pa-favorite'} onClick={() => toggleFavorite(pattern.id)}>{favorites.includes(pattern.id) ? '♥' : '♡'}</button></div><h3>{pattern.title}</h3><small>{pattern.en}</small><p>{pattern.desc}</p><div className="pa-scene-tags">{pattern.scenes.slice(0, 2).map((scene) => <span key={scene}>{scene}</span>)}</div><div className="pa-card-actions"><Button onClick={() => { setDetailId(pattern.id); setDemoResetKey(0); }}>体验演示 →</Button><Button type={selected.includes(pattern.id) ? 'primary' : 'default'} onClick={() => setSelected((old) => toggleId(old, pattern.id))}>{selected.includes(pattern.id) ? '✓ 已选择' : '＋ 选择'}</Button></div></div></article>)}</div> : <div className="pa-empty"><Empty description="没有匹配的形式"/><Button onClick={() => { setSearch(''); setCategory('all'); setFavoritesOnly(false); }}>清除筛选</Button></div>}
    </section>
    <section className="pa-bottom"><div><span className="pa-eyebrow">04 / MAKE IT REAL</span><h2>知道想要什么之后，<br/><span>直接创建可编辑页面。</span></h2><p>选好布局后可直接创建项目页面，再在统一设计器中拖拽调整组件、交互和特效。</p></div><Link to="/create"><Button className="pa-bottom-cta" size="large">创建可编辑页面 →</Button></Link></section>
    <footer className="pa-footer"><span>交互形式图鉴</span><span>选择形式，然后在设计器里继续完善</span></footer>
    {selected.length ? <div className="pa-plan-tray" role="status"><div><strong>已选择 {selected.length} 种形式</strong><small>{selectedPatterns.slice(0, 3).map((item) => item.title).join(' / ')}{selected.length > 3 ? '…' : ''}</small></div><Button size="small" onClick={() => setSelected([])}>清空</Button><Button type="primary" onClick={() => setPromptOpen(true)}>AI 开发说明（可选） ↗</Button></div> : null}

    <Drawer title={<div className="pa-drawer-title"><small>INTERACTIVE PATTERN / {detail?.en ?? ''}</small><strong>{detail?.title ?? '模式预览'}</strong></div>} open={Boolean(detail)} onClose={() => setDetailId(null)} width="min(750px, 100vw)" destroyOnHidden extra={<Button onClick={() => setDemoResetKey((n) => n + 1)}>↻ 重置演示</Button>} footer={detail ? <div className="pa-detail-footer">{serializeCompositionSnippet(detail.id) ? <Button onClick={() => exportComposition(detail.id)}>↓ 导出 Composition</Button> : null}<Button onClick={() => toggleFavorite(detail.id)}>{favorites.includes(detail.id) ? '♥ 已收藏' : '♡ 收藏'}</Button><Button type="primary" onClick={() => { addToPlan(detail.id); void messageApi.success('已加入我的方案'); }}>{selected.includes(detail.id) ? '✓ 已在我的方案' : '＋ 加入我的方案'}</Button></div> : null}>
      {detail ? <div className="pa-detail"><p className="pa-detail-intro">{detail.desc}</p><div key={`${detail.id}-${demoResetKey}`} className="pa-detail-demo"><PatternDemo id={detail.id}/></div><Divider/><h3>它解决什么问题？</h3><p>{detail.why}</p><h3>适用场景</h3><div className="pa-info-chips">{detail.scenes.map((scene) => <Tag key={scene}>{scene}</Tag>)}</div><h3>交互关键点</h3><ul>{detail.interactions.map((rule) => <li key={rule}>{rule}</li>)}</ul><h3>移动端策略</h3><p>{detail.mobile}</p><AlertNote/></div> : null}
    </Drawer>

    <Modal title={<div className="pa-prompt-title"><small>FROM IDEAS TO SPECIFICATION</small><strong>生成可选的 AI 开发说明</strong></div>} open={promptOpen} onCancel={() => setPromptOpen(false)} width={1020} footer={null} destroyOnHidden={false} className="pa-prompt-modal"><div className="pa-prompt-layout"><div className="pa-prompt-controls"><label htmlFor="pa-project-name">项目 / 页面名称</label><Input id="pa-project-name" value={projectName} maxLength={80} onChange={(event) => setProjectName(event.target.value)}/><label htmlFor="pa-visual-style">视觉风格</label><Select id="pa-visual-style" value={visualStyle} onChange={(value: VisualStyle) => setVisualStyle(value)} options={(['简洁专业', '活泼现代', '深色科技', '内容优先'] as VisualStyle[]).map((value) => ({ value, label: value }))}/><label htmlFor="pa-tech-stack">技术栈</label><Select id="pa-tech-stack" value={stack} onChange={setStack} options={['React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）', 'React + TypeScript + Tailwind CSS', 'Vue 3 + TypeScript', '不限技术栈'].map((value) => ({ label: value, value }))}/><label>已选形式 · {selected.length}</label><div className="pa-selected-chips">{selectedPatterns.length ? selectedPatterns.map((pattern) => <Tag key={pattern.id} closable onClose={() => setSelected((old) => old.filter((id) => id !== pattern.id))}>{pattern.title}</Tag>) : <span>尚未添加形式。请先在图鉴中选择。</span>}</div><label>已选特效 · {effectSelections.length}</label><div className="pa-selected-chips">{effectSelections.length ? effectSelections.map((id) => <Tag key={id}>{effectById.get(id)?.title ?? id}</Tag>) : <span>尚未添加视觉特效。</span>}<div><Link to="/patterns/effects">去特效实验室选择或调整设计参数 →</Link></div></div><label htmlFor="pa-extra-notes">额外要求（可以随项目迭代）</label><Input.TextArea id="pa-extra-notes" value={notes} autoSize={{ minRows: 4, maxRows: 8 }} onChange={(event) => setNotes(event.target.value)}/><div className="pa-tip">这里仅提供给编程 AI 的可选需求说明，不会替你生成工程。若要直接生成可编辑的前端页面，请使用顶部「创建页面」。</div></div><div className="pa-prompt-result"><div className="pa-result-head"><strong>需求草稿</strong><span>EDITABLE · LOCAL</span></div><Input.TextArea aria-label="生成的 AI 提示词，可编辑" spellCheck={false} value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} autoSize={false} style={{ height: 410, resize: 'vertical' }}/><div className="pa-result-actions"><Button onClick={() => setCustomPrompt(suggestedPrompt)}>↻ 重新生成说明</Button><Button onClick={downloadPrompt}>↓ 下载 TXT</Button><Button type="primary" onClick={() => void copyPrompt()}>复制给编程 AI ↗</Button></div></div></div></Modal>
  </div></PageContent></Page>;
}

function AlertNote() { return <div className="pa-detail-note">这是一组便于选型的交互原型，不包含真实 API、权限控制或完整的业务规则。复杂场景需在具体项目内做专项实现。</div>; }
