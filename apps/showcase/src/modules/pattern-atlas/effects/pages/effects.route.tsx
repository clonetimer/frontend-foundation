import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button, Empty, Input, Modal, Tag, message } from 'antd';
import { Link } from 'react-router';
import { Page, PageContent } from '@foundation/ui';
import { normalizePatternIds } from '../../catalog';
import { generatePatternPrompt } from '../../prompt';
import { readStoredPatternIds, readStoredPlanDraft, saveStoredPatternIds, saveStoredPlanDraft } from '../../storage';
import { buildUiBrief, parseUiBrief } from '../brief';
import { readCenterDraft, saveCenterDraft, type CenterDraft } from '../../center/model';
import { effectById, effectCategories, effects, filterEffects, type EffectCategory } from '../catalog';
import { accentChoices, defaultDesignConfig, readDesignConfig, readSelectedEffects, saveDesignConfig, saveSelectedEffects, type DesignConfig } from '../config';
import { configurationDimensions } from '../dimensions';
import { EffectDemo } from '../EffectDemo';
import '../../styles.css';
import '../styles.css';

function downloadText(filename: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ChoiceGroup<T extends string>({ title, values, value, onChange }: {
  title: string; values: { value: T; label: string }[]; value: T; onChange: (next: T) => void;
}) {
  return <div className="pa-fx-setting"><label>{title}</label><div className="pa-fx-choice-row" role="group" aria-label={title}>{values.map((item) =>
    <button type="button" key={item.value} className="pa-fx-choice" aria-pressed={item.value === value} onClick={() => onChange(item.value)}>{item.label}</button>
  )}</div></div>;
}

const symbols: Record<EffectCategory, string> = { entrance: '↗', hover: '◇', feedback: '◎', ambient: '✦', scroll: '↓' };

export function Component() {
  const [activeId, setActiveId] = useState('fade-up');
  const [replay, setReplay] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<EffectCategory | 'all'>('all');
  const [onlySelected, setOnlySelected] = useState(false);
  const [selectedEffects, setSelectedEffects] = useState<string[]>(readSelectedEffects);
  const [patternIds, setPatternIds] = useState<string[]>(() => readStoredPatternIds('selected'));
  const [design, setDesign] = useState<DesignConfig>(readDesignConfig);
  const [centerDraft, setCenterDraft] = useState<CenterDraft>(readCenterDraft);
  const [draft] = useState(readStoredPlanDraft);
  const [projectName, setProjectName] = useState(draft.projectName || '我的前端界面');
  const [notes, setNotes] = useState(draft.notes || '先在独立业务模块实施，不更改冻结的 Blueprint / Designer DSL。');
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => { saveSelectedEffects(selectedEffects); }, [selectedEffects]);
  useEffect(() => { saveDesignConfig(design); }, [design]);
  useEffect(() => { saveCenterDraft(centerDraft); }, [centerDraft]);
  useEffect(() => { saveStoredPlanDraft({ projectName, notes, stack: draft.stack || 'React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）', style: draft.style || '简洁专业' }); }, [projectName, notes, draft]);
  const filtered = useMemo(() => filterEffects({ query: search, category, selectedOnly: onlySelected, selectedIds: selectedEffects }), [search, category, onlySelected, selectedEffects]);
  const active = effectById.get(activeId) ?? effects[0]!;
  const recommendedPrompt = useMemo(() => generatePatternPrompt({
    projectName,
    selectedIds: patternIds,
    effectIds: selectedEffects,
    design,
    center: centerDraft,
    stack: draft.stack || 'React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）',
    style: draft.style || '简洁专业',
    notes
  }), [projectName, patternIds, selectedEffects, design, centerDraft, draft, notes]);
  useEffect(() => { setPromptText(recommendedPrompt); }, [recommendedPrompt]);

  function updateDesign<K extends keyof DesignConfig>(key: K, value: DesignConfig[K]) {
    setDesign((current) => ({ ...current, [key]: value }));
  }
  const addOrRemove = (id: string) => setSelectedEffects((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const exportBrief = () => {
    const brief = buildUiBrief({ projectName, patternIds, effectIds: selectedEffects, design, notes, ...centerDraft });
    downloadText('pattern-atlas-ui-brief.json', JSON.stringify(brief, null, 2), 'application/json;charset=utf-8');
  };
  const importBrief = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 200_000) { void messageApi.error('文件过大；仅支持 200KB 以下的配置 JSON'); return; }
    try {
      const brief = parseUiBrief(await file.text());
      setProjectName(brief.projectName);
      setNotes(brief.notes);
      setDesign(brief.design);
      setCenterDraft({ viewport: brief.viewport, previewState: brief.previewState, bindings: brief.bindings });
      setPatternIds(normalizePatternIds(brief.patternIds));
      setSelectedEffects(brief.effectIds);
      saveStoredPatternIds('selected', brief.patternIds);
      if (brief.effectIds[0]) setActiveId(brief.effectIds[0]);
      setReplay((n) => n + 1);
      void messageApi.success('配置已导入；布局与特效选择已更新');
    } catch (error) {
      void messageApi.error(error instanceof Error ? error.message : '导入配置失败');
    }
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(promptText); void messageApi.success('提示词已复制'); }
    catch { void messageApi.warning('剪贴板权限不可用，请在文本框内手动复制'); }
  };

  return <Page><PageContent><div className="pa-fx-page">
    {contextHolder}
    <nav className="pa-fx-top" aria-label="图鉴模块导航"><div className="pa-fx-brand"><span className="pa-fx-brand-mark">✦</span><span>PATTERN ATLAS / EFFECT STUDIO</span></div><div className="pa-fx-links"><Link to="/patterns"><Button>← 交互图鉴</Button></Link><Link to="/patterns/config"><Button>设计配置中心 ↗</Button></Link><Link to="/create"><Button type="primary">创建页面 ↗</Button></Link><Button onClick={exportBrief}>↓ 导出方案 JSON</Button><input ref={uploadRef} type="file" accept=".json,application/json" onChange={(event) => void importBrief(event)} aria-label="导入方案 JSON" hidden/><Button onClick={() => uploadRef.current?.click()}>↑ 导入方案</Button><Button type="primary" onClick={() => setPromptOpen(true)}>AI 开发说明（可选） ↗</Button></div></nav>

    <header className="pa-fx-hero"><div><span className="pa-fx-eyebrow">DESIGN SYSTEM / MOTION PLAYGROUND 02</span><h1>让界面<span>动得有意义。</span></h1><p>挑选效果、操作真实的 React 演示，并立即改变主题色、间距密度、圆角和动画策略。默认只改 Showcase，不触碰 Foundation 核心组件或 Designer 协议。</p></div><div className="pa-fx-hero-metrics"><div><strong>{effects.length}</strong><span>种可体验特效</span></div><div><strong>6</strong><span>项实时设计参数</span></div></div></header>

    <section aria-labelledby="pa-fx-live-title"><div className="pa-fx-heading"><div><span className="pa-fx-eyebrow">01 / INTERACTIVE EFFECT LAB</span><h2 id="pa-fx-live-title">先体验，再决定是否采用</h2><p>试着悬停、点击或滚动。使用「重播」观察入场类动画。</p></div><span className="pa-fx-live-label">● LIVE DEMO</span></div>
      <div className="pa-fx-main"><div className="pa-fx-main-column"><div className="pa-fx-panel"><div className="pa-fx-panel-head"><div className="pa-fx-panel-heading"><strong>{active.title} · {active.en}</strong><small>{active.trigger}触发 / {effectCategories.find((item) => item.id === active.category)?.label}</small></div><Button size="small" onClick={() => setReplay((n) => n + 1)}>↻ 重播 / 复位</Button></div>
        <div className="pa-fx-stage-wrap"><EffectDemo key={`${active.id}-${replay}`} id={active.id} config={design}/><div className="pa-fx-stage-note">这是交互原型，不接入业务数据。遵循系统减少动态偏好；你也可以在右侧关闭装饰动画。</div></div>
        <div className="pa-fx-action-row"><Button type={selectedEffects.includes(active.id) ? 'primary' : 'default'} onClick={() => addOrRemove(active.id)}>{selectedEffects.includes(active.id) ? '✓ 已加入我的方案' : '＋ 加入我的方案'}</Button><Tag>{active.trigger}触发</Tag></div>
        <div className="pa-fx-stage-meta"><h3>{active.title}<small>{active.en}</small></h3><p>{active.summary}</p><dl><div><dt>适用场景</dt><dd>{active.bestFor}</dd></div><div><dt>使用边界</dt><dd>{active.caution}</dd></div><div><dt>减少动态</dt><dd>{active.reducedMotion}</dd></div></dl></div></div></div>
      <aside className="pa-fx-panel pa-fx-settings" aria-label="实时设计参数"><div className="pa-fx-panel-head"><div className="pa-fx-panel-heading"><strong>设计参数 / DESIGN TOKENS</strong><small>改动立即作用于左侧演示</small></div><Button size="small" onClick={() => setDesign({ ...defaultDesignConfig })}>恢复默认</Button></div><div className="pa-fx-settings-body"><div className="pa-fx-setting"><label>强调色</label><div className="pa-fx-swatches" role="group" aria-label="强调色">{accentChoices.map((choice) => <button key={choice.value} type="button" className="pa-fx-swatch" aria-label={`${choice.label} ${choice.color}`} aria-pressed={design.accent === choice.value} title={choice.label} onClick={() => updateDesign('accent', choice.value)}><span style={{ background: choice.color }} aria-hidden="true">{design.accent === choice.value ? '✓' : ''}</span></button>)}</div></div>
        <ChoiceGroup title="表面主题" value={design.surface} onChange={(next) => updateDesign('surface', next)} values={[{ value:'light',label:'明亮' },{ value:'dark',label:'深色' }]}/>
        <ChoiceGroup title="信息密度" value={design.density} onChange={(next) => updateDesign('density', next)} values={[{ value:'comfortable',label:'舒适' },{ value:'compact',label:'紧凑' }]}/>
        <ChoiceGroup title="圆角语言" value={design.radius} onChange={(next) => updateDesign('radius', next)} values={[{ value:'soft',label:'柔和' },{ value:'square',label:'方正' },{ value:'round',label:'圆润' }]}/>
        <ChoiceGroup title="运动策略" value={design.motion} onChange={(next) => updateDesign('motion', next)} values={[{ value:'system',label:'跟随系统' },{ value:'reduced',label:'减少动态' },{ value:'off',label:'关闭装饰动画' }]}/>
        <ChoiceGroup title="运动速度" value={design.speed} onChange={(next) => updateDesign('speed', next)} values={[{ value:'slow',label:'舒缓' },{ value:'normal',label:'标准' },{ value:'fast',label:'快速' }]}/>
        <div className="pa-fx-note">为避免干扰阅读，视觉特效不应替代操作结果。即使选择「跟随系统」，当操作系统要求减少动态时，仍会去掉装饰性运动。</div>
      </div></aside></div>
    </section>

    <section aria-labelledby="pa-fx-effects-title"><div className="pa-fx-heading"><div><span className="pa-fx-eyebrow">02 / EFFECT CATALOG</span><h2 id="pa-fx-effects-title">特效选择库</h2><p>按触发方式与用途分类。点击任意卡片，左侧预览会切换为对应特效。</p></div><strong>{filtered.length} / {effects.length}</strong></div><div className="pa-fx-filter-bar"><div className="pa-fx-filter-cats" role="group" aria-label="按特效类别筛选">{effectCategories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.symbol} {item.label}</button>)}</div><div className="pa-fx-filter-tools"><Input aria-label="搜索特效" allowClear placeholder="名称 / 用途…" value={search} onChange={(event) => setSearch(event.target.value)}/><Button type={onlySelected ? 'primary' : 'default'} aria-pressed={onlySelected} onClick={() => setOnlySelected((previous) => !previous)}>只看已选</Button></div></div>
      {filtered.length ? <div className="pa-fx-effects-grid">{filtered.map((effect, index) => <button type="button" className={`pa-fx-effect${active.id === effect.id ? ' is-active' : ''}`} aria-pressed={active.id === effect.id} key={effect.id} onClick={() => { setActiveId(effect.id); setReplay((n) => n + 1); document.getElementById('pa-fx-live-title')?.scrollIntoView({ behavior: 'auto', block: 'start' }); }}><div className="pa-fx-thumb" data-category={effect.category}><span aria-hidden="true">{symbols[effect.category]}</span></div><div className="pa-fx-effect-info"><small>{String(index + 1).padStart(2,'0')} / {effect.en}</small><strong>{effect.title}{selectedEffects.includes(effect.id) ? ' ✓' : ''}</strong><p>{effect.summary}</p><em>点击体验 →</em></div></button>)}</div> : <Empty description="没有匹配的特效"><Button onClick={() => { setSearch(''); setCategory('all'); setOnlySelected(false); }}>重置筛选</Button></Empty>}
      <div className="pa-fx-selected"><div><strong>已选择 {selectedEffects.length} 项特效 · {patternIds.length} 种界面形式</strong><p>{selectedEffects.length ? selectedEffects.map((id) => effectById.get(id)?.title).filter(Boolean).join(' / ') : '建议只选择确实能提高任务效率或信息反馈的效果。'}</p></div><div className="pa-fx-selected-actions"><Button size="small" onClick={() => setSelectedEffects([])} disabled={!selectedEffects.length}>清空特效</Button><Button type="primary" onClick={() => setPromptOpen(true)}>生成方案 ↗</Button></div></div>
    </section>

    <section aria-labelledby="pa-fx-dimensions-title"><div className="pa-fx-heading"><div><span className="pa-fx-eyebrow">03 / BEYOND COMPONENTS & EFFECTS</span><h2 id="pa-fx-dimensions-title">前端还有哪些关键可配置项？</h2><p>以下是工程设计决策全景。绿色标注的能力已在本实验室提供基础配置；其余是后续迭代的候选项，不能误认为已实现。</p></div></div><div className="pa-fx-dimensions">{configurationDimensions.map((item) => <article className="pa-fx-dimension" key={item.name}><span aria-hidden="true">{item.icon}</span><h3>{item.name}</h3><p>{item.detail}</p><small>{item.status}</small></article>)}</div></section>

    <Modal title="AI 页面需求 · 包含布局、特效与设计参数" className="pa-fx-prompt-modal" open={promptOpen} onCancel={() => setPromptOpen(false)} footer={null} width={850} destroyOnHidden={false}><div className="pa-fx-setting" style={{ marginBottom: 10 }}><label htmlFor="pa-fx-project-name">项目 / 页面名</label><Input id="pa-fx-project-name" maxLength={80} value={projectName} onChange={(event) => setProjectName(event.target.value)}/></div><div className="pa-fx-setting" style={{ marginBottom: 13 }}><label htmlFor="pa-fx-notes">迭代要求</label><Input.TextArea id="pa-fx-notes" autoSize={{ minRows: 2, maxRows: 5 }} value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)}/></div><Input.TextArea aria-label="UI 需求提示词，可编辑" value={promptText} onChange={(event) => setPromptText(event.target.value)} autoSize={false} style={{ height: 315, resize: 'vertical' }}/><div className="pa-fx-prompt-actions"><Button onClick={() => setPromptText(recommendedPrompt)}>↻ 重新生成</Button><Button onClick={() => downloadText('pattern-atlas-prompt.txt', promptText, 'text/plain;charset=utf-8')}>↓ 下载 TXT</Button><Button type="primary" onClick={() => void copyPrompt()}>复制提示词 ↗</Button></div></Modal>
    <footer className="pa-footer" style={{ marginTop: 38 }}><span>视觉特效图鉴</span><span>查看喜欢的效果，带入页面设计</span></footer>
  </div></PageContent></Page>;
}
