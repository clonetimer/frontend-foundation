import catalog from './patterns.json';

export type CategoryId = 'layout' | 'navigation' | 'data' | 'interaction' | 'forms' | 'feedback';
export interface Pattern {
  id: string;
  title: string;
  en: string;
  cat: CategoryId;
  desc: string;
  why: string;
  scenes: string[];
  interactions: string[];
  mobile: string;
  icon: string;
}
export interface PatternCategory { id: CategoryId | 'all'; name: string; icon: string; color: string; }

export const patterns: Pattern[] = catalog.patterns as Pattern[];
export const categories: PatternCategory[] = catalog.categories as PatternCategory[];
export const allPatternIds = patterns.map(({ id }) => id);
export const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));

export function getPattern(id: string): Pattern | undefined { return patternById.get(id); }

export function filterPatterns(options: { search?: string; category?: CategoryId | 'all'; favoritesOnly?: boolean; favorites?: string[] }): Pattern[] {
  const query = (options.search ?? '').trim().toLocaleLowerCase();
  const favorites = new Set(options.favorites ?? []);
  return patterns.filter((pattern) =>
    (options.category === undefined || options.category === 'all' || pattern.cat === options.category) &&
    (!options.favoritesOnly || favorites.has(pattern.id)) &&
    (!query || [pattern.title, pattern.en, pattern.desc, ...pattern.scenes, ...pattern.interactions]
      .some((value) => value.toLocaleLowerCase().includes(query)))
  );
}

export function normalizePatternIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set(allPatternIds);
  return [...new Set(input.filter((item): item is string => typeof item === 'string' && valid.has(item)))];
}

export const layoutVariants = [
  { id: 'bento', label: 'Bento 网格', note: '按信息重要性分配卡片面积，适合总体概览。' },
  { id: 'kanban', label: '看板分列', note: '按状态组织任务，直接暴露工作流与瓶颈。' },
  { id: 'timeline', label: '时间轴', note: '按日期依次呈现任务，强调先后顺序。' },
  { id: 'master-detail', label: '主从分栏', note: '列表与详情联动，方便高频切换条目。' },
  { id: 'data-table', label: '数据表格', note: '利于排序、对比和处理高密度信息。' },
  { id: 'calendar', label: '日历视图', note: '把时间设为浏览坐标，适合任务排期。' }
] as const;

export interface SampleTask { id: string; title: string; status: '待开始' | '进行中' | '已完成'; owner: string; date: string; priority: '高' | '中' | '低'; }
export const sampleTasks: SampleTask[] = [
  { id: 'T-101', title: '梳理用户反馈与需求', status: '已完成', owner: '林然', date: '10/07', priority: '高' },
  { id: 'T-102', title: '制作关键页面线框稿', status: '进行中', owner: '陈一', date: '10/10', priority: '高' },
  { id: 'T-103', title: '验证移动端导航', status: '待开始', owner: '李可', date: '10/13', priority: '中' },
  { id: 'T-104', title: '统一交互状态规范', status: '进行中', owner: '周舟', date: '10/15', priority: '中' },
  { id: 'T-105', title: '走查无障碍焦点', status: '待开始', owner: '林然', date: '10/18', priority: '低' },
  { id: 'T-106', title: '发布第一轮原型', status: '待开始', owner: '陈一', date: '10/21', priority: '高' }
];
