import { defaultDesignConfig, type DesignConfig } from '../effects/config';

/** Named presets are reference starting points; exported plans store explicit tokens. */
export const designPresets: { id: string; name: string; description: string; design: DesignConfig }[] = [
  { id: 'neutral', name: '清晰工作台', description: '适合管理后台、生产力工具', design: defaultDesignConfig },
  { id: 'editorial', name: '内容阅读', description: '衬线字体、宽松间距、弱阴影', design: { ...defaultDesignConfig, font: 'editorial', typeScale: 'large', spacing: 'airy', elevation: 'flat', radius: 'square', accent: 'blue' } },
  { id: 'technical', name: '数据终端', description: '深色背景、紧凑密度、等宽字体', design: { ...defaultDesignConfig, font: 'technical', surface: 'dark', density: 'compact', radius: 'square', spacing: 'tight', elevation: 'soft', accent: 'amber' } },
  { id: 'expressive', name: '品牌展示', description: '圆润、强调层次与宽松节奏', design: { ...defaultDesignConfig, accent: 'coral', radius: 'round', elevation: 'strong', spacing: 'airy', typeScale: 'large' } }
];
