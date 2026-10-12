import { effectById } from '../effects/catalog';

/** Showcase-only preview choices; not a Blueprint or a runtime behavior engine. */
export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';
export type PreviewState = 'ready' | 'loading' | 'empty' | 'error' | 'success';
export type BindingTarget = 'primary-action' | 'feature-card' | 'status-banner';
export type BindingTrigger = 'click' | 'hover' | 'enter';
export type BindingDelay = 0 | 150 | 300;
export interface EffectBinding { target: BindingTarget; effectId: string; trigger: BindingTrigger; delayMs: BindingDelay; }
export interface CenterDraft { viewport: PreviewViewport; previewState: PreviewState; bindings: EffectBinding[]; }

/** Only these effect/target/trigger combinations are actually implemented in the preview. */
export const effectTargets = [
  { id: 'primary-action', label: '主操作按钮', options: [
    { effectId: 'ripple', trigger: 'click', label: '点击涟漪 / 点击' },
    { effectId: 'shine', trigger: 'hover', label: '扫光高亮 / 悬停' }
  ] },
  { id: 'feature-card', label: '内容卡片', options: [
    { effectId: 'hover-lift', trigger: 'hover', label: '悬浮抬升 / 悬停' },
    { effectId: 'shine', trigger: 'hover', label: '扫光高亮 / 悬停' }
  ] },
  { id: 'status-banner', label: '状态提示区', options: [
    { effectId: 'fade-up', trigger: 'enter', label: '渐显上移 / 状态进入' },
    { effectId: 'success-check', trigger: 'enter', label: '成功描边 / 成功态进入' }
  ] }
] as const;

export const defaultCenterDraft: CenterDraft = {
  viewport: 'desktop', previewState: 'ready',
  bindings: [
    { target: 'primary-action', effectId: 'ripple', trigger: 'click', delayMs: 0 },
    { target: 'feature-card', effectId: 'hover-lift', trigger: 'hover', delayMs: 0 },
    { target: 'status-banner', effectId: 'fade-up', trigger: 'enter', delayMs: 0 }
  ]
};

export function normalizeEffectBindings(input: unknown): EffectBinding[] {
  if (!Array.isArray(input)) return [];
  const found = new Set<BindingTarget>();
  const bindings: EffectBinding[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const target = effectTargets.find((candidate) => candidate.id === raw.target);
    const option = target?.options.find((candidate) => candidate.effectId === raw.effectId && candidate.trigger === raw.trigger);
    if (!target || !option || found.has(target.id) || !effectById.has(option.effectId)) continue;
    found.add(target.id);
    const delayMs: BindingDelay = raw.delayMs === 150 || raw.delayMs === 300 ? raw.delayMs : 0;
    bindings.push({ target: target.id, effectId: option.effectId, trigger: option.trigger, delayMs });
  }
  return bindings;
}

export function normalizeCenterDraft(input: unknown): CenterDraft {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return {
    viewport: raw.viewport === 'mobile' || raw.viewport === 'tablet' ? raw.viewport : 'desktop',
    previewState: raw.previewState === 'loading' || raw.previewState === 'empty' || raw.previewState === 'error' || raw.previewState === 'success' ? raw.previewState : 'ready',
    bindings: raw.bindings === undefined ? defaultCenterDraft.bindings.map((binding) => ({ ...binding })) : normalizeEffectBindings(raw.bindings)
  };
}

const CENTER_KEY = 'foundation-showcase:pattern-atlas:v2:center-draft';
export function readCenterDraft(): CenterDraft {
  if (typeof window === 'undefined') return normalizeCenterDraft(null);
  try { return normalizeCenterDraft(JSON.parse(window.localStorage.getItem(CENTER_KEY) ?? '{}') as unknown); }
  catch { return normalizeCenterDraft(null); }
}
export function saveCenterDraft(draft: CenterDraft): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CENTER_KEY, JSON.stringify(normalizeCenterDraft(draft))); }
  catch { /* Storage may be disabled; the current React state still works. */ }
}

export function describeCenterDraft(input: CenterDraft): string[] {
  const draft = normalizeCenterDraft(input);
  const viewLabel = { desktop: '桌面', tablet: '平板', mobile: '手机' }[draft.viewport];
  const stateLabel = { ready: '正常', loading: '加载中', empty: '空态', error: '错误', success: '成功' }[draft.previewState];
  return [
    `预览验收：${viewLabel}视口、${stateLabel}状态；真实项目仍须覆盖其他屏幕与状态。`,
    ...draft.bindings.map((binding) => {
      const target = effectTargets.find((entry) => entry.id === binding.target)!;
      const effect = effectById.get(binding.effectId)!;
      const trigger = { click: '点击', hover: '悬停/焦点', enter: '状态进入' }[binding.trigger];
      return `${target.label}：${effect.title}；触发：${trigger}；延迟：${binding.delayMs}ms；减少动态时以静态反馈替代。`;
    })
  ];
}
