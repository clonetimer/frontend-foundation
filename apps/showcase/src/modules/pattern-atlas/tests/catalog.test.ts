import { describe, expect, it } from 'vitest';
import { allPatternIds, categories, filterPatterns, getPattern, layoutVariants, normalizePatternIds, patterns } from '../catalog';
import { generatePatternPrompt } from '../prompt';
import { normalizePlanDraft } from '../storage';

const defaults = { projectName: '客户管理', style: '简洁专业' as const, stack: 'React + TypeScript', notes: '' };

describe('Pattern Atlas: source data', () => {
  it('ships 38 unique patterns with six categories and complete editorial guidance', () => {
    expect(patterns).toHaveLength(38);
    expect(new Set(allPatternIds).size).toBe(38);
    expect(categories).toHaveLength(7); // Six pattern categories plus All.
    for (const pattern of patterns) {
      expect(categories.some((category) => category.id === pattern.cat)).toBe(true);
      expect(pattern.title).toBeTruthy();
      expect(pattern.desc).toBeTruthy();
      expect(pattern.why).toBeTruthy();
      expect(pattern.scenes.length).toBeGreaterThan(0);
      expect(pattern.interactions.length).toBeGreaterThan(0);
      expect(pattern.mobile).toBeTruthy();
      expect(getPattern(pattern.id)).toEqual(pattern);
    }
  });

  it('offers the six shared-data layout comparisons', () => {
    expect(layoutVariants).toHaveLength(6);
    for (const layout of layoutVariants) expect(getPattern(layout.id)?.cat).toBe('layout');
  });

  it('searches names and usage scenarios, combines category and favorite filters', () => {
    expect(filterPatterns({ search: 'Bento' }).map((p) => p.id)).toContain('bento');
    expect(filterPatterns({ search: '知识库' }).map((p) => p.id)).toContain('master-detail');
    expect(filterPatterns({ category: 'feedback' }).every((p) => p.cat === 'feedback')).toBe(true);
    expect(filterPatterns({ category: 'layout', favoritesOnly: true, favorites: ['bento', 'modal'] }).map((p) => p.id)).toEqual(['bento']);
    expect(filterPatterns({ search: 'not-a-real-pattern' })).toEqual([]);
  });

  it('accepts only known plan style and bounded draft text', () => {
    const result = normalizePlanDraft({ projectName: 'A'.repeat(100), style: 'injected', stack: 'React', notes: '持续迭代' });
    expect(result.projectName).toHaveLength(80);
    expect(result.style).toBeUndefined();
    expect(result.stack).toBe('React');
    expect(result.notes).toBe('持续迭代');
    expect(normalizePlanDraft(null)).toEqual({});
  });

  it('sanitizes unknown persisted ids without losing user order', () => {
    expect(normalizePatternIds(['modal', 'bento', 'modal', 'unknown', {}, null])).toEqual(['modal', 'bento']);
    expect(normalizePatternIds({ bad: 'shape' })).toEqual([]);
  });
});

describe('Pattern Atlas: iterative prompt builder', () => {
  it('uses the first layout as primary and explicitly handles multiple selected layouts', () => {
    const result = generatePatternPrompt({ ...defaults, selectedIds: ['kanban', 'modal', 'bento'] });
    expect(result).toContain('主布局：看板分列');
    expect(result).toContain('布局参考/备选：Bento 非对称网格');
    expect(result).toContain('模态弹窗');
    expect(result).toContain('移动端');
    expect(result).toContain('不要擅自修改既有公共 API');
  });

  it('preserves specific requirements while filtering invalid ids', () => {
    const result = generatePatternPrompt({ ...defaults, selectedIds: ['nope', 'drawer'], notes: '需要同时支持键盘与鼠标。' });
    expect(result).toContain('尚未指定主布局');
    expect(result).toContain('侧滑抽屉');
    expect(result).toContain('需要同时支持键盘与鼠标');
    expect(result).not.toContain('nope');
  });
});
