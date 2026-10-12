import { useState, type CSSProperties, type MouseEvent, type PointerEvent, type UIEvent } from 'react';
import { designCssVariables, type DesignConfig } from './config';

interface Ripple { key: number; left: number; top: number; }

/** A deliberately local demo. No global pointer/scroll handlers or animation dependencies. */
export function EffectDemo({ id, config }: { id: string; config: DesignConfig }) {
  const [pointer, setPointer] = useState({ x: 50, y: 50 });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [scrollPercent, setScrollPercent] = useState(0);
  const variables = {
    ...designCssVariables(config),
    '--pa-fx-spot-x': `${pointer.x}%`,
    '--pa-fx-spot-y': `${pointer.y}%`,
    '--pa-fx-tilt-y': `${((pointer.x - 50) / 50 * 8).toFixed(2)}deg`,
    '--pa-fx-tilt-x': `${((50 - pointer.y) / 50 * 8).toFixed(2)}deg`
  } as CSSProperties;

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || config.motion !== 'system' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setPointer({
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
    });
  };
  const addRipple = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setRipples((previous) => [...previous.slice(-3), {
      key: (previous.at(-1)?.key ?? 0) + 1,
      left: event.detail && rect.width ? (event.clientX - rect.left) / rect.width * 100 : 50,
      top: event.detail && rect.height ? (event.clientY - rect.top) / rect.height * 100 : 50
    }]);
  };
  const updateScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const maximum = el.scrollHeight - el.clientHeight;
    setScrollPercent(maximum > 0 ? Math.round(el.scrollTop / maximum * 100) : 100);
  };

  return <div className="pa-fx-demo" data-theme={config.surface} data-motion={config.motion} data-effect={id} style={variables}>
    {id === 'fade-up' && <div className="pa-fx-appear pa-fx-demo-card"><span className="pa-fx-label">PROJECT UPDATE</span><strong>一切，从一个清晰的重点开始。</strong><p>入场方向不是风格本身，而是信息排序的补充。</p><div className="pa-fx-demo-bar" /></div>}
    {id === 'slide-reveal' && <div className="pa-fx-mask"><div className="pa-fx-reveal-card"><span className="pa-fx-label">EDITORIAL / 002</span><strong>灵感，有序展开。</strong><p>用短促揭示突出一处主内容。</p></div></div>}
    {id === 'stagger' && <div className="pa-fx-stagger"><span className="pa-fx-label">NEXT STEPS</span>{['01　确定信息架构', '02　选择主展示形式', '03　完善交互与状态', '04　小范围验证并迭代'].map((entry, i) => <div className="pa-fx-stagger-item" style={{ animationDelay: `${i * 100}ms` }} key={entry}><span>✓</span>{entry}</div>)}</div>}
    {id === 'typewriter' && <div className="pa-fx-terminal"><span className="pa-fx-label">ASSISTANT / LIVE PREVIEW</span><div className="pa-fx-typed" aria-label="正在生成交互式工作台">正在生成交互式工作台</div><small>屏幕阅读器直接读取完整文本</small></div>}
    {id === 'hover-lift' && <button type="button" className="pa-fx-lift pa-fx-demo-card" onClick={() => setEnabled((v) => !v)}><span className="pa-fx-label">INTERACTIVE CARD ↗</span><strong>鼠标靠近，层级浮现</strong><p>可点击、可键盘聚焦。当前：{enabled ? '已选中' : '未选中'}</p><span className="pa-fx-action">{enabled ? '✓ 已选择' : '点击试试 →'}</span></button>}
    {id === 'tilt' && <div className="pa-fx-tilt-space" onPointerMove={movePointer} onPointerLeave={() => setPointer({ x: 50, y: 50 })}><button type="button" className="pa-fx-tilt-card" onClick={() => setEnabled((v) => !v)}><span className="pa-fx-label">POINTER / 3D</span><strong>轻量的空间反馈</strong><small>{enabled ? '已确认' : '移动鼠标，再点击'}</small></button></div>}
    {id === 'spotlight' && <div className="pa-fx-spot-area" onPointerMove={movePointer} onPointerLeave={() => setPointer({ x: 50, y: 50 })}><div className="pa-fx-spot-card"><span className="pa-fx-label">SPOTLIGHT / SURFACE</span><strong>光，跟随你的探索。</strong><p>仅作装饰，不承担状态传达。</p></div></div>}
    {id === 'shine' && <button type="button" className="pa-fx-shine" onClick={() => setEnabled((v) => !v)}><span className="pa-fx-label">FEATURED ACTION</span><strong>{enabled ? '已了解设计方案' : '探索全新视角'}</strong><span>查看详情 ↗</span></button>}
    {id === 'flip' && <button type="button" aria-pressed={flipped} aria-label={flipped ? '显示卡片正面' : '显示卡片背面'} className={`pa-fx-flip-wrap${flipped ? ' is-flipped' : ''}`} onClick={() => setFlipped((value) => !value)}><span className="pa-fx-flip-inner"><span className="pa-fx-flip-face"><span className="pa-fx-label">FRONT SIDE</span><strong>一个问题，两面信息。</strong><small>点击翻到背面 ↻</small></span><span className="pa-fx-flip-face pa-fx-flip-back"><span className="pa-fx-label">BACK SIDE</span><strong>交互必须可通过键盘操作。</strong><small>再点一次返回 ↻</small></span></span></button>}
    {id === 'ripple' && <div className="pa-fx-center"><span className="pa-fx-label">PRESS FEEDBACK</span><button type="button" className="pa-fx-ripple-button" onClick={addRipple}>点击触发涟漪 <span aria-hidden="true">↗</span>{ripples.map((r) => <span key={r.key} aria-hidden="true" className="pa-fx-ripple" style={{ left: `${r.left}%`, top: `${r.top}%` }} />)}</button><small>按钮动作仍需真实结果状态。</small></div>}
    {id === 'morph-toggle' && <div className="pa-fx-center"><span className="pa-fx-label">PREFERENCE</span><div className="pa-fx-toggle-row"><div><strong>智能辅助</strong><small>{enabled ? '已启用' : '已关闭'}</small></div><button type="button" className={`pa-fx-toggle${enabled ? ' is-on' : ''}`} aria-label="智能辅助" aria-pressed={enabled} onClick={() => setEnabled((value) => !value)}><span /></button></div><small>状态同时通过文本和 aria-pressed 描述。</small></div>}
    {id === 'success-check' && <div className="pa-fx-center"><span className="pa-fx-label">ACTION STATE</span><svg className={`pa-fx-check${checked ? ' is-done' : ''}`} viewBox="0 0 88 88" role="img" aria-label={checked ? '操作已完成' : '操作待确认'}><circle cx="44" cy="44" r="35"/><path d="M25 45 L39 58 L64 31"/></svg><strong>{checked ? '保存成功' : '等待确认'}</strong><button type="button" className="pa-fx-mini-action" onClick={() => setChecked((value) => !value)}>{checked ? '恢复初始状态' : '模拟保存成功'}</button></div>}
    {id === 'progress-ring' && <div className="pa-fx-center"><span className="pa-fx-label">TASK PROGRESS / DEMO</span><div className="pa-fx-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="pa-fx-ring-track" cx="60" cy="60" r="43"/><circle className="pa-fx-ring-fill" cx="60" cy="60" r="43"/></svg><strong>76%</strong></div><small>演示数据：完成率 76%，不是实时业务进度</small></div>}
    {id === 'gradient-flow' && <div className="pa-fx-gradient"><span className="pa-fx-label">ATMOSPHERE / COLOR</span><strong>给内容留白，也给情绪空间。</strong><small>背景在低速变化，正文保持可读。</small></div>}
    {id === 'floating-orbs' && <div className="pa-fx-orbs"><span className="pa-fx-orb orb-one"/><span className="pa-fx-orb orb-two"/><span className="pa-fx-orb orb-three"/><div><span className="pa-fx-label">AMBIENT ELEMENTS</span><strong>层次可以轻，注意力要稳。</strong></div></div>}
    {id === 'skeleton-wave' && <div className="pa-fx-skeleton"><span className="pa-fx-label">LOADING PLACEHOLDER</span><div className="pa-fx-skeleton-head"><span className="pa-fx-skeleton-pulse"/><div><i className="pa-fx-skeleton-pulse"/><i className="pa-fx-skeleton-pulse"/></div></div><i className="pa-fx-skeleton-pulse"/><i className="pa-fx-skeleton-pulse short"/><small role="status">演示：内容加载中…</small></div>}
    {id === 'ticker' && <div className="pa-fx-ticker-container"><span className="pa-fx-label">PAUSE ON HOVER / FOCUS</span><div className="pa-fx-ticker" tabIndex={0} aria-label="可暂停的设计主题标签"><div>{['REACT', 'ACCESSIBLE', 'RESPONSIVE', 'TOKENS', 'MOTION', 'REACT', 'ACCESSIBLE', 'RESPONSIVE', 'TOKENS', 'MOTION'].map((tag, i) => <span key={`${tag}-${i}`}>{tag}</span>)}</div></div><small>指针移入或键盘聚焦时暂停。</small></div>}
    {id === 'scroll-progress' && <div className="pa-fx-reading"><div className="pa-fx-reading-bar" role="progressbar" aria-label="阅读位置" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scrollPercent}><span style={{ width: `${scrollPercent}%` }}/></div><div className="pa-fx-reading-head"><span className="pa-fx-label">READING PROGRESS</span><strong>{scrollPercent}%</strong></div><div className="pa-fx-scroll-content" tabIndex={0} role="region" aria-label="模拟文章滚动区域" onScroll={updateScroll}>{['确定用户任务', '规划信息层级', '设计导航路径', '选择展示形式', '加入状态反馈', '检查响应式与触屏', '尊重减少动态设置', '验收性能与可访问性'].map((step, i) => <div key={step}><span>0{i + 1}</span><strong>{step}</strong><p>滚动下面的内容，观察顶部细线和百分比如何同步更新。</p></div>)}</div></div>}
  </div>;
}
