import { normalizeEffectIds } from './catalog';

/** Personal design parameters. No Foundation global theme or DSL changes. */
export type Accent = 'jade' | 'blue' | 'coral' | 'amber';
export type Surface = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
export type Radius = 'soft' | 'square' | 'round';
export type MotionPreference = 'system' | 'reduced' | 'off';
export type MotionSpeed = 'slow' | 'normal' | 'fast';
export type FontFamily = 'sans' | 'editorial' | 'technical';
export type TypeScale = 'small' | 'regular' | 'large';
export type Spacing = 'tight' | 'balanced' | 'airy';
export type Elevation = 'flat' | 'soft' | 'strong';

export interface DesignConfig {
  accent: Accent;
  surface: Surface;
  density: Density;
  radius: Radius;
  motion: MotionPreference;
  speed: MotionSpeed;
  font: FontFamily;
  typeScale: TypeScale;
  spacing: Spacing;
  elevation: Elevation;
}

export const defaultDesignConfig: DesignConfig = {
  accent: 'jade', surface: 'light', density: 'comfortable', radius: 'soft', motion: 'system', speed: 'normal',
  font: 'sans', typeScale: 'regular', spacing: 'balanced', elevation: 'soft'
};

const accents: Record<Accent, { hex: string; rgb: string; name: string }> = {
  jade: { hex: '#11765c', rgb: '17, 118, 92', name: '松绿' },
  blue: { hex: '#475bc5', rgb: '71, 91, 197', name: '靛蓝' },
  coral: { hex: '#b34d42', rgb: '179, 77, 66', name: '陶红' },
  amber: { hex: '#916113', rgb: '145, 97, 19', name: '琥珀' }
};

export const accentChoices = Object.entries(accents).map(([value, entry]) => ({ value: value as Accent, label: entry.name, color: entry.hex }));

function fromEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fallback;
}

export function normalizeDesignConfig(input: unknown): DesignConfig {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return {
    accent: fromEnum(raw.accent, ['jade', 'blue', 'coral', 'amber'] as const, defaultDesignConfig.accent),
    surface: fromEnum(raw.surface, ['light', 'dark'] as const, defaultDesignConfig.surface),
    density: fromEnum(raw.density, ['comfortable', 'compact'] as const, defaultDesignConfig.density),
    radius: fromEnum(raw.radius, ['soft', 'square', 'round'] as const, defaultDesignConfig.radius),
    motion: fromEnum(raw.motion, ['system', 'reduced', 'off'] as const, defaultDesignConfig.motion),
    speed: fromEnum(raw.speed, ['slow', 'normal', 'fast'] as const, defaultDesignConfig.speed),
    font: fromEnum(raw.font, ['sans', 'editorial', 'technical'] as const, defaultDesignConfig.font),
    typeScale: fromEnum(raw.typeScale, ['small', 'regular', 'large'] as const, defaultDesignConfig.typeScale),
    spacing: fromEnum(raw.spacing, ['tight', 'balanced', 'airy'] as const, defaultDesignConfig.spacing),
    elevation: fromEnum(raw.elevation, ['flat', 'soft', 'strong'] as const, defaultDesignConfig.elevation)
  };
}

export function designCssVariables(input: DesignConfig): Record<string, string> {
  const config = normalizeDesignConfig(input);
  const accent = accents[config.accent];
  return {
    '--pa-fx-accent': accent.hex,
    '--pa-fx-accent-rgb': accent.rgb,
    '--pa-fx-radius': config.radius === 'square' ? '4px' : config.radius === 'round' ? '28px' : '16px',
    '--pa-fx-font': config.font === 'editorial' ? 'Georgia, "Noto Serif SC", serif' : config.font === 'technical' ? 'ui-monospace, "SFMono-Regular", Consolas, monospace' : 'Inter, "Noto Sans SC", system-ui, sans-serif',
    '--pa-fx-type-scale': config.typeScale === 'small' ? '.9' : config.typeScale === 'large' ? '1.13' : '1',
    '--pa-fx-shadow': config.elevation === 'flat' ? 'none' : config.elevation === 'strong' ? '0 18px 44px rgba(18,48,39,.20)' : '0 8px 26px rgba(18,48,39,.09)',
    '--pa-fx-layout-space': config.spacing === 'tight' ? '12px' : config.spacing === 'airy' ? '27px' : '18px',
    '--pa-fx-gap': config.density === 'compact' ? '9px' : '16px',
    '--pa-fx-space': config.density === 'compact' ? '14px' : '23px',
    '--pa-fx-duration': config.speed === 'slow' ? '850ms' : config.speed === 'fast' ? '220ms' : '480ms',
    '--pa-fx-loop': config.speed === 'slow' ? '12s' : config.speed === 'fast' ? '4s' : '8s',
    '--pa-fx-type-duration': config.speed === 'slow' ? '3.3s' : config.speed === 'fast' ? '.9s' : '1.8s',
    '--pa-fx-shimmer-duration': config.speed === 'slow' ? '4s' : config.speed === 'fast' ? '1.4s' : '2.6s'
  };
}

const STORAGE_KEY = 'foundation-showcase:pattern-atlas:v1:design-config';
const EFFECT_IDS_KEY = 'foundation-showcase:pattern-atlas:v1:selected-effects';

export function readDesignConfig(): DesignConfig {
  if (typeof window === 'undefined') return { ...defaultDesignConfig };
  try { return normalizeDesignConfig(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown); }
  catch { return { ...defaultDesignConfig }; }
}
export function saveDesignConfig(config: DesignConfig): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeDesignConfig(config))); }
  catch { /* Private browsing or restrictive host; keep in-memory state. */ }
}

export function readSelectedEffects(): string[] {
  if (typeof window === 'undefined') return [];
  try { return normalizeEffectIds(JSON.parse(window.localStorage.getItem(EFFECT_IDS_KEY) ?? '[]') as unknown); }
  catch { return []; }
}
export function saveSelectedEffects(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(EFFECT_IDS_KEY, JSON.stringify(normalizeEffectIds(ids))); }
  catch { /* State still works in memory. */ }
}

export function describeDesignConfig(config: DesignConfig): string[] {
  const normalized = normalizeDesignConfig(config);
  return [
    `配色：${accents[normalized.accent].name}（${accents[normalized.accent].hex}）；底色：${normalized.surface === 'dark' ? '深色' : '浅色'}。`,
    `信息密度：${normalized.density === 'compact' ? '紧凑' : '舒适'}；圆角：${({ soft: '柔和', square: '方正', round: '圆润' } as const)[normalized.radius]}。`,
    `运动策略：${({ system: '遵循系统减少动态偏好', reduced: '主动减少运动', off: '关闭装饰运动' } as const)[normalized.motion]}；动画速度：${({ slow: '舒缓', normal: '标准', fast: '快速' } as const)[normalized.speed]}。`,
    `字体：${({ sans: '无衬线', editorial: '衬线', technical: '等宽' } as const)[normalized.font]}；字号：${({ small: '小', regular: '标准', large: '大' } as const)[normalized.typeScale]}；间距：${({ tight: '紧凑', balanced: '均衡', airy: '宽松' } as const)[normalized.spacing]}；阴影：${({ flat: '平面', soft: '柔和', strong: '强调' } as const)[normalized.elevation]}。`
  ];
}
