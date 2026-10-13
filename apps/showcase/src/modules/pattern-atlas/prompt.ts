import { getPattern, normalizePatternIds, type Pattern } from './catalog';
import { effectById, normalizeEffectIds } from './effects/catalog';
import { describeDesignConfig, type DesignConfig } from './effects/config';
import { describeCenterDraft, normalizeCenterDraft, type CenterDraft } from './center/model';

export type VisualStyle = '简洁专业' | '活泼现代' | '深色科技' | '内容优先';
export interface PromptOptions { projectName: string; style: VisualStyle; stack: string; selectedIds: string[]; notes: string; effectIds?: string[]; design?: DesignConfig; center?: CenterDraft; themeBridge?: boolean; }

function describe(pattern: Pattern): string {
  return `- ${pattern.title}（${pattern.en}）：${pattern.desc}\n  使用场景：${pattern.scenes.join('、')}。\n  交互要点：${pattern.interactions.join('；')}。\n  移动端：${pattern.mobile}`;
}

export function generatePatternPrompt(options: PromptOptions): string {
  const selected = normalizePatternIds(options.selectedIds).map(getPattern).filter((p): p is Pattern => Boolean(p));
  const layouts = selected.filter((p) => p.cat === 'layout');
  const auxiliary = selected.filter((p) => p.cat !== 'layout');
  const effectChoices = normalizeEffectIds(options.effectIds ?? []).map((id) => effectById.get(id)).filter((effect) => effect !== undefined);
  const projectName = options.projectName.trim() || '待设计页面';
  const notes = options.notes.trim();
  const hasVisual = Boolean(effectChoices.length || options.design || options.center);
  return [
    `请为「${projectName}」设计并实现可运行、可迭代的前端界面。`,
    `技术栈：${options.stack}。视觉方向：${options.style}。`,
    '',
    '一、业务与结构优先级',
    '首先围绕用户目标组织信息，而不是把所有模块做成等宽等高卡片。',
    ...(layouts.length ? [
      `主布局：${layouts[0]?.title}。`,
      ...layouts.slice(1).map((p) => `布局参考/备选：${p.title}，请不要未经确认将多种主布局同时套到同一页面。`)
    ] : ['尚未指定主布局；先提供 2 种候选的信息架构并说明取舍。']),
    '',
    '二、选定形式与行为',
    ...(selected.length ? selected.map(describe) : ['- 尚未选择交互形式；请优先给出信息架构草案。']),
    '',
    ...(hasVisual ? [
      '三、设计参数与视觉特效',
      ...(options.design ? describeDesignConfig(options.design) : []),
      ...(options.center ? ['组件级动效绑定与预览状态：', ...describeCenterDraft(normalizeCenterDraft(options.center))] : []),
      ...(effectChoices.length ? [
        '仅在适合的局部区域使用以下特效，不要求每个模块都动起来：',
        ...effectChoices.map((effect) => `- ${effect.title}（${effect.en}，触发：${effect.trigger}）：${effect.summary} 使用建议：${effect.bestFor}。注意：${effect.caution} 减少动态：${effect.reducedMotion}`)
      ] : []),
      ...(options.themeBridge && options.design ? ['主题实施：按 FoundationThemeProvider 公开接口设置 brand / defaultMode / defaultDensity，Ant Design Token 仅通过 ConfigProvider/ThemeProvider 生效；导出的 motion 和 speed 不是 Foundation ThemeProvider 参数，单独用 CSS 处理。用户已保存的主题偏好可能覆盖 defaultMode。不得直接修改 Foundation Core、Designer DSL 或全局 localStorage。'] : []),
      '保证 prefers-reduced-motion 适配；避免自动播放的高频、大幅度动画和阻塞交互。',
      ''
    ] : []),
    hasVisual ? '四、实施要求' : '三、实施要求',
    '1. 保持清楚的信息层级、可键盘操作的控件、可见焦点与必要的 aria 标签。',
    '2. 对加载中、空状态、成功、失败以及重复提交给出明确的处理。',
    '3. 做好桌面端与手机端适配，避免强行保留窄小的多栏布局。',
    '4. 使用结构化的独立组件和有类型的数据，便于后续修改布局，不要把全部逻辑写入一个组件。',
    '5. 在开始改代码前列出涉及的文件及影响范围；不要擅自修改既有公共 API 或无关业务逻辑。',
    ...(auxiliary.length ? [`6. 辅助交互：${auxiliary.map((p) => p.title).join('、')}，仅在确实解决任务问题时出现。`] : []),
    ...(notes ? ['', hasVisual ? '五、额外业务要求' : '四、额外业务要求', notes] : []),
    '',
    '请先给出页面分区及关键交互流程，再给出实现；若有不确定的业务规则，请显式标记假设。'
  ].join('\n');
}
