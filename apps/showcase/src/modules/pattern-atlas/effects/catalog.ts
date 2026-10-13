/** Selectable visual treatments: separate from page structure and task interactions. */
export type EffectCategory = 'entrance' | 'hover' | 'feedback' | 'ambient' | 'scroll';
export type EffectTrigger = '进入' | '悬停' | '点击' | '持续' | '滚动';

export interface EffectDefinition {
  id: string;
  title: string;
  en: string;
  category: EffectCategory;
  trigger: EffectTrigger;
  summary: string;
  bestFor: string;
  caution: string;
  reducedMotion: string;
}

export const effectCategories: { id: EffectCategory | 'all'; label: string; symbol: string }[] = [
  { id: 'all', label: '全部特效', symbol: '◈' },
  { id: 'entrance', label: '入场与叙事', symbol: '↗' },
  { id: 'hover', label: '悬停与探索', symbol: '◇' },
  { id: 'feedback', label: '操作与反馈', symbol: '◎' },
  { id: 'ambient', label: '氛围与装饰', symbol: '✦' },
  { id: 'scroll', label: '滚动与进度', symbol: '↓' }
];

export const effects: EffectDefinition[] = [
  { id: 'fade-up', title: '渐显上移', en: 'Fade + Rise', category: 'entrance', trigger: '进入', summary: '内容淡入并轻微上移，建立进入时的视觉顺序。', bestFor: '模块首屏、详情卡片、空状态切换', caution: '避免给整个长列表反复添加动画。', reducedMotion: '直接呈现最终内容，保留清晰的信息层级。' },
  { id: 'slide-reveal', title: '遮罩揭示', en: 'Masked Reveal', category: 'entrance', trigger: '进入', summary: '内容从裁切区域中揭示，适合重点叙事。', bestFor: '项目封面、故事页面、案例标题', caution: '避免遮挡关键操作，动画不应阻塞用户阅读。', reducedMotion: '移除裁切运动，静态显示完整内容。' },
  { id: 'stagger', title: '列表错峰入场', en: 'Staggered Items', category: 'entrance', trigger: '进入', summary: '多个相关元素以短间隔依次出现。', bestFor: '导航、结果摘要、步骤说明', caution: '间隔短、总时长可控；大量数据不逐项延迟。', reducedMotion: '所有项目立即显示。' },
  { id: 'typewriter', title: '逐字呈现', en: 'Typewriter', category: 'entrance', trigger: '进入', summary: '短文案逐字展开，强调信息生成的过程。', bestFor: '助手状态、短标题、生成过程演示', caution: '不能用于关键信息加载；需让屏幕阅读器获得完整文本。', reducedMotion: '直接显示完整文案，去除闪烁光标。' },
  { id: 'hover-lift', title: '悬浮抬升', en: 'Hover Lift', category: 'hover', trigger: '悬停', summary: '卡片轻微抬升并增强阴影，提示可操作。', bestFor: '可点击卡片、可选模板', caution: '移动端没有 hover；必须提供点击与焦点反馈。', reducedMotion: '使用边框与阴影静态变化替代位移。' },
  { id: 'tilt', title: '指针倾斜', en: 'Pointer Tilt', category: 'hover', trigger: '悬停', summary: '卡片随指针位置做轻微 3D 倾斜。', bestFor: '展示作品、精选封面、创意入口', caution: '控制幅度，避免影响文字可读性。', reducedMotion: '关闭角度变化，仅保留焦点框。' },
  { id: 'spotlight', title: '局部聚光', en: 'Pointer Spotlight', category: 'hover', trigger: '悬停', summary: '聚光位置跟随指针，让表面层次更清晰。', bestFor: '素材封面、画廊、探索入口', caution: '不以光效作为唯一状态提示。', reducedMotion: '不跟随指针，保留静态高亮。' },
  { id: 'shine', title: '扫光高亮', en: 'Sheen Sweep', category: 'hover', trigger: '悬停', summary: '斜向高光短暂扫过可点击区域。', bestFor: '品牌展示、主操作 CTA', caution: '避免在密集表格或频繁操作区域重复扫光。', reducedMotion: '将扫光替换为静态边框高亮。' },
  { id: 'flip', title: '翻面揭示', en: 'Flip Card', category: 'hover', trigger: '点击', summary: '点击后翻转卡片，呈现另一侧的信息。', bestFor: '对比、知识卡、简短参数说明', caution: '必须可通过键盘触发，不能仅依赖悬停。', reducedMotion: '点击时直接切换正反两面信息。' },
  { id: 'ripple', title: '点击涟漪', en: 'Click Ripple', category: 'feedback', trigger: '点击', summary: '从按下位置扩散的短促反馈。', bestFor: '触屏按钮、确定操作', caution: '不能代替加载中、成功或失败的文本反馈。', reducedMotion: '保留按压态或边框反馈，不做扩散。' },
  { id: 'morph-toggle', title: '形态切换', en: 'Morph Toggle', category: 'feedback', trigger: '点击', summary: '开关位置和颜色变化形成连续的状态反馈。', bestFor: '偏好设置、二元功能开关', caution: '使用语义化按钮与 aria-pressed/checked。', reducedMotion: '即时切换颜色与位置。' },
  { id: 'success-check', title: '完成描边', en: 'Drawn Check', category: 'feedback', trigger: '点击', summary: '成功图标以描边过程出现，强化操作完成感。', bestFor: '保存完成、步骤通过、批量完成', caution: '成功状态必须同时有文字，不依赖颜色或图形。', reducedMotion: '立即显示完整成功图标与文本。' },
  { id: 'progress-ring', title: '环形进度', en: 'Progress Ring', category: 'feedback', trigger: '进入', summary: '圆弧变化呈现有限的完成进度。', bestFor: '上传进度、任务完成率', caution: '仅当进度真实可度量时用于生产环境。', reducedMotion: '显示明确百分比，进度环无需动画。' },
  { id: 'gradient-flow', title: '渐变流动', en: 'Animated Gradient', category: 'ambient', trigger: '持续', summary: '大面积柔和渐变缓慢流动，建立氛围感。', bestFor: '品牌封面、介绍区、空白背景', caution: '避免为大面积背景使用高频重绘或高对比闪烁。', reducedMotion: '使用静态渐变，保证前景文字对比。' },
  { id: 'floating-orbs', title: '漂浮光球', en: 'Floating Orbs', category: 'ambient', trigger: '持续', summary: '少量装饰性光球低速漂浮，创造空间层次。', bestFor: '欢迎页、演示封面', caution: '装饰不可遮挡文本或拦截指针事件。', reducedMotion: '保留静态圆形装饰。' },
  { id: 'skeleton-wave', title: '骨架呼吸', en: 'Skeleton Shimmer', category: 'ambient', trigger: '持续', summary: '加载占位符有轻微明暗变化，传达等待状态。', bestFor: '卡片/表格首屏加载', caution: '只在真实加载时展示；超时需有可读错误状态。', reducedMotion: '保持静态骨架，加载语义不变。' },
  { id: 'ticker', title: '信息跑马灯', en: 'Ticker', category: 'ambient', trigger: '持续', summary: '短标签横向循环流动，容纳有限的品牌/主题列表。', bestFor: '品牌墙、非关键信息标签', caution: '自动运动须可暂停；重要内容不能只在跑马灯中提供。', reducedMotion: '标签静态展示，可横向滚动。' },
  { id: 'scroll-progress', title: '滚动阅读进度', en: 'Reading Progress', category: 'scroll', trigger: '滚动', summary: '阅读区域的滚动比例映射到进度条。', bestFor: '长文档、教程、阅读流程', caution: '不要误把滚动位置当作任务完成率。', reducedMotion: '即时更新宽度和百分比，无补间运动。' }
];

const idSet = new Set(effects.map((effect) => effect.id));
export const effectById = new Map(effects.map((effect) => [effect.id, effect]));

export function normalizeEffectIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((id): id is string => typeof id === 'string' && idSet.has(id)))];
}

export function filterEffects(options: { query?: string; category?: EffectCategory | 'all'; selectedOnly?: boolean; selectedIds?: string[] }): EffectDefinition[] {
  const query = (options.query ?? '').trim().toLocaleLowerCase();
  const selected = new Set(options.selectedIds ?? []);
  return effects.filter((effect) =>
    (!options.category || options.category === 'all' || effect.category === options.category) &&
    (!options.selectedOnly || selected.has(effect.id)) &&
    (!query || [effect.title, effect.en, effect.summary, effect.bestFor, effect.trigger]
      .some((field) => field.toLocaleLowerCase().includes(query)))
  );
}
