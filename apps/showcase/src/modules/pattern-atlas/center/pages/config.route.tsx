import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Button, Input, Modal, Tag, message } from 'antd';
import { Link } from 'react-router';
import { Page, PageContent } from '@foundation/ui';
import { normalizePatternIds } from '../../catalog';
import { generatePatternPrompt } from '../../prompt';
import { readStoredPatternIds, readStoredPlanDraft, saveStoredPatternIds, saveStoredPlanDraft } from '../../storage';
import { buildUiBrief, parseUiBrief } from '../../effects/brief';
import { readSelectedEffects, saveSelectedEffects, readDesignConfig, saveDesignConfig, designCssVariables, accentChoices, defaultDesignConfig, type DesignConfig } from '../../effects/config';
import { defaultCenterDraft, effectTargets, normalizeEffectBindings, readCenterDraft, saveCenterDraft, type BindingTarget, type CenterDraft, type PreviewState, type PreviewViewport } from '../model';
import { designPresets } from '../presets';
import { toFoundationThemeExport, foundationThemeUsageSource } from '../theme-adapter';
import { ThemeBridgePreview } from '../ThemeBridgePreview';
import '../../styles.css';
import '../../effects/styles.css';
import '../styles.css';
import '../theme-bridge.css';

const viewports: { id: PreviewViewport; label: string; hint: string }[] = [
  { id: 'desktop', label: '桌面', hint: '自适应宽屏' },
  { id: 'tablet', label: '平板', hint: '768px 模拟容器' },
  { id: 'mobile', label: '手机', hint: '390px 模拟容器' }
];
const states: { id: PreviewState; label: string }[] = [
  { id: 'ready', label: '正常' }, { id: 'loading', label: '加载中' }, { id: 'empty', label: '无数据' },
  { id: 'error', label: '错误' }, { id: 'success', label: '成功' }
];

function Choice<T extends string>({ name, value, options, change }: {
  name: string; value: T; options: readonly { value: T; label: string }[]; change: (value: T) => void;
}) {
  return <div className="pa-cfg-setting"><strong>{name}</strong><div className="pa-cfg-choices" role="group" aria-label={name}>{options.map((option) =>
    <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => change(option.value)}>{option.label}</button>
  )}</div></div>;
}

function downloadText(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCss(config: DesignConfig): string {
  return ['/* Pattern Atlas preview tokens. Apply to a local container; not the Foundation global theme. */', '.pattern-atlas-theme {',
    ...Object.entries(designCssVariables(config)).map(([name, value]) => `  ${name}: ${value};`), '}'].join('\n');
}

export function Component() {
  const [design, setDesign] = useState<DesignConfig>(readDesignConfig);
  const [center, setCenter] = useState<CenterDraft>(readCenterDraft);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readStoredPatternIds('selected'));
  const [effectIds, setEffectIds] = useState<string[]>(readSelectedEffects);
  const [plan] = useState(readStoredPlanDraft);
  const [name, setName] = useState(plan.projectName || '我的前端界面');
  const [notes, setNotes] = useState(plan.notes || '页面结构可逐步修改，不要更改原有 Foundation DSL。');
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [replay, setReplay] = useState(0);
  const [rippleCount, setRippleCount] = useState(0);
  const [picked, setPicked] = useState(false);
  const [scopedThemeEnabled, setScopedThemeEnabled] = useState(true);
  const [notice, setNotice] = useState('演示数据不会上传或提交到服务器。');
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => { saveDesignConfig(design); }, [design]);
  useEffect(() => { saveCenterDraft(center); }, [center]);
  useEffect(() => {
    saveStoredPlanDraft({ projectName: name, notes, stack: plan.stack || 'React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）', style: plan.style || '简洁专业' });
  }, [name, notes, plan]);

  const selectedBinding = (target: BindingTarget) => center.bindings.find((entry) => entry.target === target);
  const primary = selectedBinding('primary-action');
  const feature = selectedBinding('feature-card');
  const banner = selectedBinding('status-banner');
  const css = designCssVariables(design) as CSSProperties;
  const themeExport = useMemo(() => toFoundationThemeExport(design), [design]);
  const themeJson = useMemo(() => JSON.stringify(themeExport, null, 2), [themeExport]);
  const themeSource = useMemo(() => foundationThemeUsageSource(design), [design]);
  const brief = useMemo(() => buildUiBrief({ projectName: name, notes, design, patternIds: selectedIds, effectIds, ...center }), [name, notes, design, selectedIds, effectIds, center]);
  const recommendedPrompt = useMemo(() => generatePatternPrompt({
    projectName: name, notes, design, selectedIds, effectIds, center, themeBridge: true,
    style: plan.style || '简洁专业', stack: plan.stack || 'React 19 + TypeScript + Ant Design（沿用 Frontend Foundation）'
  }), [name, notes, design, selectedIds, effectIds, center, plan]);
  useEffect(() => { setPromptText(recommendedPrompt); }, [recommendedPrompt]);

  function updateDesign<K extends keyof DesignConfig>(key: K, value: DesignConfig[K]) { setDesign((valueBefore) => ({ ...valueBefore, [key]: value })); }
  function updateCenter<K extends keyof CenterDraft>(key: K, value: CenterDraft[K]) { setCenter((before) => ({ ...before, [key]: value })); }
  function updateBinding(target: BindingTarget, effectId: string) {
    const existing = center.bindings.filter((entry) => entry.target !== target);
    const option = effectTargets.find((item) => item.id === target)?.options.find((item) => item.effectId === effectId);
    updateCenter('bindings', normalizeEffectBindings(option ? [...existing, { target, effectId: option.effectId, trigger: option.trigger, delayMs: 0 }] : existing));
    setReplay((value) => value + 1);
    setRippleCount(0);
  }
  function updateDelay(target: BindingTarget, delayMs: 0 | 150 | 300) {
    updateCenter('bindings', center.bindings.map((binding) => binding.target === target ? { ...binding, delayMs } : binding));
    setReplay((value) => value + 1);
  }
  function primaryAction() {
    setRippleCount((count) => count + 1);
    setCenter((current) => ({ ...current, previewState: 'success' }));
    setReplay((value) => value + 1);
    setNotice('操作完成：已切换到成功状态。这是一段本地交互演示。');
  }
  function resetAll() {
    setDesign({ ...defaultDesignConfig });
    setCenter({ ...defaultCenterDraft, bindings: defaultCenterDraft.bindings.map((binding) => ({ ...binding })) });
    setReplay((value) => value + 1);
    setPicked(false);
    setRippleCount(0);
  }
  const importBrief = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 200_000) { void messageApi.error('文件过大，仅支持 200KB 以下的方案'); return; }
    try {
      const imported = parseUiBrief(await file.text());
      setName(imported.projectName);
      setNotes(imported.notes);
      setDesign(imported.design);
      setCenter({ viewport: imported.viewport, previewState: imported.previewState, bindings: imported.bindings });
      setSelectedIds(normalizePatternIds(imported.patternIds));
      setEffectIds(imported.effectIds);
      saveStoredPatternIds('selected', imported.patternIds);
      saveSelectedEffects(imported.effectIds);
      setReplay((value) => value + 1);
      void messageApi.success('已导入方案（旧 v1 文件会自动迁移为 v2）');
    } catch (error) { void messageApi.error(error instanceof Error ? error.message : '方案导入失败'); }
  };
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); void messageApi.success('已复制到剪贴板'); }
    catch { void messageApi.warning('浏览器未授权剪贴板，请手动复制'); }
  }

  return <Page><PageContent><div className="pa-cfg-page">
    {contextHolder}
    <nav className="pa-cfg-top" aria-label="图鉴功能导航"><div className="pa-cfg-logo"><span>✳</span><strong>PATTERN ATLAS / CONFIG CENTER</strong></div><div className="pa-cfg-nav"><Link to="/patterns"><Button>← 交互图鉴</Button></Link><Link to="/patterns/effects"><Button>特效实验室 ↗</Button></Link><Link to="/create"><Button type="primary">创建页面 ↗</Button></Link><Link to="/records/pilot"><Button>业务页面试点 ↗</Button></Link><Button onClick={() => fileRef.current?.click()}>导入方案</Button><input ref={fileRef} hidden type="file" accept=".json,application/json" aria-label="导入方案 JSON" onChange={(event) => void importBrief(event)}/><Button onClick={() => downloadText('pattern-atlas-ui-brief-v2.json', JSON.stringify(brief, null, 2), 'application/json;charset=utf-8')}>导出方案 JSON</Button><Button onClick={() => setPromptOpen(true)}>AI 开发说明（可选）</Button></div></nav>
    <div className="pa-cfg-hero"><div><span className="pa-cfg-eyebrow">PHASE 03 · DESIGN CONFIGURATION</span><h1>从挑选效果，到<span>定义界面规则。</span></h1><p>同一组界面参数，分别试用不同设备、业务状态和组件绑定。所有配置只作用于本地预览，确认方案后再用于真实产品。</p></div><div className="pa-cfg-hero-numbers"><div><b>10</b><small>项设计参数</small></div><div><b>3</b><small>可绑定的组件位置</small></div><div><b>5</b><small>交互状态</small></div></div></div>
    <section className="pa-cfg-workspace" aria-label="前端可视化配置工作台">
      <div className="pa-cfg-main">
        <div className="pa-cfg-section-head"><div><span className="pa-cfg-eyebrow">01 · LIVE PREVIEW</span><h2>预览真实的取舍</h2><p>先切设备和状态，再改变设计系统。预览宽度是模拟容器，不是浏览器级移动端测试。</p></div><Button onClick={() => { setReplay((value) => value + 1); setNotice('已重新触发入场反馈'); }}>↻ 重播效果</Button></div>
        <div className="pa-cfg-tabs" role="group" aria-label="模拟视口">{viewports.map((viewport) => <button key={viewport.id} type="button" aria-pressed={center.viewport === viewport.id} onClick={() => updateCenter('viewport', viewport.id)} title={viewport.hint}>{viewport.label}<small>{viewport.id === 'desktop' ? '≥ 1024' : viewport.id === 'tablet' ? '768' : '390'}</small></button>)}</div>
        <div className="pa-cfg-tabs pa-cfg-state-tabs" role="group" aria-label="预览业务状态">{states.map((state) => <button key={state.id} type="button" aria-pressed={center.previewState === state.id} onClick={() => { updateCenter('previewState', state.id); setReplay((value) => value + 1); }}>{state.label}</button>)}</div>
        <div className="pa-cfg-preview-scene">
          <div className="pa-cfg-device-label"><span>●</span> LIVE MOCK · {viewports.find((viewport) => viewport.id === center.viewport)?.hint} <span>SCHEMA v2</span></div>
          <div className="pa-cfg-frame" data-viewport={center.viewport} data-surface={design.surface} data-motion={design.motion} style={css}>
            <div className="pa-cfg-preview-nav"><div className="pa-cfg-app-id"><span>◈</span><strong>forma.</strong></div><nav aria-label="演示工作台导航"><span className="is-current">概览</span><span>项目</span><span>团队</span></nav><span className="pa-cfg-avatar" aria-label="模拟用户头像">F</span></div>
            <div className="pa-cfg-preview-body"><div className="pa-cfg-preview-title"><div><span>WORKSPACE / OVERVIEW</span><h3>更有秩序的工作，<br/>从这里开始。</h3><p>欢迎查看今日项目进度与接下来的任务。</p></div><div className="pa-cfg-title-accent" aria-hidden="true">✳</div></div>
              <div className="pa-cfg-preview-intro"><div><span className="pa-cfg-overline">PROJECT HEALTH</span><strong>本周重点</strong><small>最近同步：模拟数据</small></div><button type="button" className="pa-cfg-primary" data-effect={primary?.effectId ?? 'none'} style={{ '--pa-cfg-delay': `${primary?.delayMs ?? 0}ms` } as CSSProperties} disabled={center.previewState === 'loading'} onClick={primaryAction}>完成本周检查 <span aria-hidden="true">↗</span>{primary?.effectId === 'ripple' && rippleCount > 0 && <i key={rippleCount} className="pa-cfg-ripple" aria-hidden="true"/>}</button></div>
              <div key={`${center.previewState}-${replay}`} className="pa-cfg-status" data-effect={banner?.effectId ?? 'none'} style={{ '--pa-cfg-delay': `${banner?.delayMs ?? 0}ms` } as CSSProperties}>
                {center.previewState === 'error' ? <div role="alert"><b>无法载入项目数据</b><span>请确认网络或重试；演示不会发起真实请求。</span><button type="button" onClick={() => updateCenter('previewState', 'ready')}>模拟重试 ↗</button></div> :
                  center.previewState === 'loading' ? <div role="status"><b>加载中…</b><span>正在展示静态骨架，不模拟网络请求。</span></div> :
                  center.previewState === 'empty' ? <div role="status"><b>还没有项目</b><span>从新建项目开始，避免出现空白界面。</span></div> :
                  center.previewState === 'success' ? <div role="status"><b><span className="pa-cfg-success-icon" aria-hidden="true">✓</span> 本周检查已完成</b><span>操作结果通过文本和图标同时呈现。</span></div> :
                  <div role="status"><b>状态良好 · 3 项任务待跟进</b><span>集中注意力处理今天最重要的任务。</span></div>}
              </div>
              {center.previewState === 'loading' ? <div className="pa-cfg-loading-grid" role="status" aria-label="列表加载中"><div/><div/><div/></div> : center.previewState === 'empty' ? <div className="pa-cfg-placeholder"><span>◎</span><strong>为项目准备一个新的开始</strong><button type="button" onClick={() => updateCenter('previewState', 'ready')}>查看示例任务</button></div> : center.previewState === 'error' ? <div className="pa-cfg-placeholder"><span>!</span><strong>出现可恢复的加载错误</strong><button type="button" onClick={() => updateCenter('previewState', 'ready')}>模拟恢复</button></div> : <div className="pa-cfg-preview-grid"><button type="button" className="pa-cfg-feature-card" data-effect={feature?.effectId ?? 'none'} aria-pressed={picked} style={{ '--pa-cfg-delay': `${feature?.delayMs ?? 0}ms` } as CSSProperties} onClick={() => { setPicked((value) => !value); setNotice('卡片已切换选择状态。'); }}><span className="pa-cfg-overline">TOTAL PROGRESS</span><strong>76<span>%</span></strong><div className="pa-cfg-progress"><span /></div><small>{picked ? '✓ 已选择 · 可再次点击取消' : '较上周提升 12% · 点击选择卡片'}</small></button><div className="pa-cfg-preview-list"><div><span className="pa-cfg-overline">UPCOMING TASKS</span><b>接下来做什么</b></div>{['梳理信息架构', '检查交互反馈', '完成移动端验收'].map((item, index) => <div className="pa-cfg-task" key={item}><span>{`0${index + 1}`}</span><strong>{item}</strong><small>{index === 0 ? '进行中' : '待开始'}</small></div>)}</div></div>}
              <div className="pa-cfg-preview-footer"><span>FORMA / SYSTEM PREVIEW</span><span>LOCAL DEMO ONLY</span></div>
            </div>
          </div>
        </div>
        <p className="pa-cfg-feedback" role="status">{notice}</p>
        <div className="pa-cfg-section-head pa-cfg-separate"><div><span className="pa-cfg-eyebrow">02 · EFFECT BINDINGS</span><h2>把特效绑定到具体位置</h2><p>当前仅允许三种可实际演示的目标；触发方式取决于所选效果，不能任意填写执行代码。</p></div></div>
        <div className="pa-cfg-bind-grid">{effectTargets.map((item) => { const binding = selectedBinding(item.id); return <div className="pa-cfg-bind" key={item.id}><span>{item.label}</span><label htmlFor={`pa-cfg-bind-${item.id}`}>效果及触发方式</label><select id={`pa-cfg-bind-${item.id}`} value={binding?.effectId ?? ''} onChange={(event) => updateBinding(item.id, event.target.value)}><option value="">无动态效果</option>{item.options.map((effect) => <option key={effect.effectId} value={effect.effectId}>{effect.label}</option>)}</select><label htmlFor={`pa-cfg-delay-${item.id}`}>延迟（毫秒）</label><select id={`pa-cfg-delay-${item.id}`} value={binding?.delayMs ?? 0} disabled={!binding} onChange={(event) => updateDelay(item.id, Number(event.target.value) as 0 | 150 | 300)}><option value={0}>0</option><option value={150}>150</option><option value={300}>300</option></select></div>; })}</div>
        <p className="pa-cfg-help">键盘焦点可触发悬停类的等效高亮；运动设置为「减少 / 关闭」时，位移、涟漪与描边动画被抑制，文本反馈仍然有效。</p>
      </div>
      <aside className="pa-cfg-controls" aria-label="设计系统配置"><div className="pa-cfg-controls-head"><div><span className="pa-cfg-eyebrow">03 · DESIGN TOKENS</span><h2>调整设计系统</h2><p>四组快速预设与十项精细配置。</p></div><Button size="small" onClick={resetAll}>全部复位</Button></div>
        <div className="pa-cfg-presets">{designPresets.map((preset) => <button type="button" key={preset.id} onClick={() => setDesign({ ...preset.design })}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}</div>
        <div className="pa-cfg-divider">颜色 / 背景 / 层次</div><div className="pa-cfg-setting"><strong>强调色</strong><div className="pa-cfg-swatches" role="group" aria-label="强调色">{accentChoices.map((choice) => <button type="button" key={choice.value} aria-label={choice.label} aria-pressed={design.accent === choice.value} style={{ '--pa-cfg-color': choice.color } as CSSProperties} onClick={() => updateDesign('accent', choice.value)}><span>✓</span></button>)}</div></div>
        <Choice name="表面主题" value={design.surface} options={[{ value: 'light', label: '明亮' }, { value: 'dark', label: '深色' }]} change={(value) => updateDesign('surface', value)} />
        <Choice name="圆角" value={design.radius} options={[{ value: 'square', label: '方正' }, { value: 'soft', label: '柔和' }, { value: 'round', label: '圆润' }]} change={(value) => updateDesign('radius', value)} />
        <Choice name="阴影深度" value={design.elevation} options={[{ value: 'flat', label: '平面' }, { value: 'soft', label: '轻盈' }, { value: 'strong', label: '强化' }]} change={(value) => updateDesign('elevation', value)} />
        <div className="pa-cfg-divider">排版 / 节奏</div>
        <Choice name="字体气质" value={design.font} options={[{ value: 'sans', label: '无衬线' }, { value: 'editorial', label: '衬线' }, { value: 'technical', label: '等宽' }]} change={(value) => updateDesign('font', value)} />
        <Choice name="字号尺度" value={design.typeScale} options={[{ value: 'small', label: '精简' }, { value: 'regular', label: '标准' }, { value: 'large', label: '醒目' }]} change={(value) => updateDesign('typeScale', value)} />
        <Choice name="模块间距" value={design.spacing} options={[{ value: 'tight', label: '紧密' }, { value: 'balanced', label: '均衡' }, { value: 'airy', label: '宽松' }]} change={(value) => updateDesign('spacing', value)} />
        <Choice name="信息密度" value={design.density} options={[{ value: 'compact', label: '紧凑' }, { value: 'comfortable', label: '舒适' }]} change={(value) => updateDesign('density', value)} />
        <div className="pa-cfg-divider">动态与无障碍</div>
        <Choice name="运动策略" value={design.motion} options={[{ value: 'system', label: '跟随系统' }, { value: 'reduced', label: '减少动态' }, { value: 'off', label: '关闭' }]} change={(value) => updateDesign('motion', value)} />
        <Choice name="动画速度" value={design.speed} options={[{ value: 'slow', label: '慢' }, { value: 'normal', label: '标准' }, { value: 'fast', label: '快' }]} change={(value) => updateDesign('speed', value)} />
        <div className="pa-cfg-export"><b>局部 CSS Token 输出</b><p>导出的 CSS 类可以作为实现参考，但不会自动覆盖 Foundation 的全局主题。</p><Button block onClick={() => downloadText('pattern-atlas-tokens.css', exportCss(design), 'text/css;charset=utf-8')}>↓ 下载 Token CSS</Button><Button block onClick={() => void copy(exportCss(design))}>复制 CSS 变量</Button></div>
      </aside>
    </section>
    <section className="pa-theme-bridge" aria-labelledby="pa-theme-title">
      <div className="pa-theme-head"><div><span className="pa-cfg-eyebrow">04 · FOUNDATION THEME ADAPTER</span><h2 id="pa-theme-title">把配置变成真正可用的主题</h2><p>八项设计参数已映射到 Foundation 公共主题接口与 Ant Design Token；「运动策略、动画速度」仍由页面级 CSS 实现，不会被错误写入主题 API。</p></div><span className="pa-theme-count">8 / 10 映射</span></div>
      <div className="pa-theme-tools"><Button type={scopedThemeEnabled ? 'primary' : 'default'} aria-pressed={scopedThemeEnabled} onClick={() => setScopedThemeEnabled((previous) => !previous)}>{scopedThemeEnabled ? '✓ 局部主题已开启 · 点击撤回' : '启用局部主题预览'}</Button><Button onClick={() => downloadText('foundation-theme-preset-v1.json', themeJson, 'application/json;charset=utf-8')}>↓ 导出 Foundation 主题 JSON</Button><Button onClick={() => downloadText('foundation-theme-usage.tsx', themeSource, 'text/plain;charset=utf-8')}>↓ 导出 TSX 示例</Button><Button onClick={() => void copy(themeJson)}>复制主题 JSON</Button><Link to="/records/pilot"><Button type="primary">在 Records 业务页对照试用 ↗</Button></Link></div>
      <div className="pa-theme-body"><div className="pa-theme-demo"><ThemeBridgePreview preset={themeExport} enabled={scopedThemeEnabled}/><p className="pa-theme-footnote">此处使用嵌套 Ant Design ConfigProvider 进行局部试点。关闭开关即可撤回；不会改变整个 Showcase 的主题、本地保存的偏好或 Blueprint。</p></div><div className="pa-theme-mapping"><strong>映射关系</strong><dl><div><dt>强调色 / 圆角 / 字体</dt><dd>BrandTheme / AntD Tokens</dd></div><div><dt>字号 / 阴影</dt><dd>AntD Global Tokens</dd></div><div><dt>深浅主题 / 密度</dt><dd>Provider 默认模式 / 尺寸</dd></div><div><dt>模块间距</dt><dd>BrandTheme.layout.contentPadding</dd></div><div className="pa-theme-unmapped"><dt>运动策略 / 速度</dt><dd>只导出 previewOnly；需额外实现</dd></div></dl><details><summary>查看生成的主题接入示例</summary><pre>{themeSource}</pre></details><p>注意：FoundationThemeProvider 的 <code>defaultMode</code> 和 <code>defaultDensity</code> 是默认值，浏览器已经保存的用户偏好可能优先生效。</p></div></div>
    </section>
    <section className="pa-cfg-bottom"><div><span className="pa-cfg-eyebrow">05 · KEEP ITERATING</span><h2>现在是选型配置，不是最终业务代码。</h2><p>方案以 v2 JSON 保存，并兼容 Phase 2 的 v1 导入。它可记录参数、示例视口、状态和动效绑定；真实项目仍需实现数据接口、权限、焦点管理、可访问性验收与测试。</p></div><div><Tag color="green">已选 {selectedIds.length} 种形式</Tag><Tag color="blue">已选 {effectIds.length} 种特效</Tag><Button type="primary" onClick={() => setPromptOpen(true)}>导出 AI 开发说明（可选） ↗</Button></div></section>
    <Modal title="可复制的前端 UI 实施需求" width={860} open={promptOpen} onCancel={() => setPromptOpen(false)} footer={null}><div className="pa-cfg-modal-input"><label htmlFor="pa-cfg-project">项目名称</label><Input id="pa-cfg-project" maxLength={80} value={name} onChange={(event) => setName(event.target.value)}/><label htmlFor="pa-cfg-notes">补充需求</label><Input.TextArea id="pa-cfg-notes" maxLength={5000} autoSize={{ minRows: 2, maxRows: 4 }} value={notes} onChange={(event) => setNotes(event.target.value)}/></div><Input.TextArea aria-label="生成的方案提示词" value={promptText} autoSize={false} style={{ height: 300, resize: 'vertical' }} onChange={(event) => setPromptText(event.target.value)}/><div className="pa-cfg-modal-actions"><Button onClick={() => setPromptText(recommendedPrompt)}>↻ 重新生成</Button><Button onClick={() => downloadText('pattern-atlas-prompt.txt', promptText, 'text/plain;charset=utf-8')}>↓ 下载 TXT</Button><Button type="primary" onClick={() => void copy(promptText)}>复制提示词</Button></div></Modal>
    <footer className="pa-cfg-footer">配置中心 · 外观与预览设置</footer>
  </div></PageContent></Page>;
}
