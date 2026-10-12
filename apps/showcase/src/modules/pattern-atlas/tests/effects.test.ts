import { describe, expect, it } from 'vitest';
import { buildUiBrief, parseUiBrief } from '../effects/brief';
import { effectCategories, effects, filterEffects, normalizeEffectIds } from '../effects/catalog';
import { defaultDesignConfig, describeDesignConfig, designCssVariables, normalizeDesignConfig } from '../effects/config';
import { configurationDimensions } from '../effects/dimensions';
import { generatePatternPrompt } from '../prompt';

const params = { projectName: '产品仪表盘', style: '简洁专业' as const, stack: 'React 19 + TS', notes: '', selectedIds: ['bento'] };

describe('Effect Studio: catalogs and safe persistence', () => {
  it('offers 18 unique documented effects in five categories', () => {
    expect(effects).toHaveLength(18);
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
    expect(effectCategories).toHaveLength(6);
    for (const effect of effects) {
      expect(effectCategories.some((category) => category.id === effect.category)).toBe(true);
      expect(effect.bestFor).toBeTruthy();
      expect(effect.caution).toBeTruthy();
      expect(effect.reducedMotion).toBeTruthy();
    }
  });
  it('supports category, keyword, selection filters and drops unknown ids', () => {
    expect(filterEffects({ query: 'Ripple' }).map((effect) => effect.id)).toEqual(['ripple']);
    expect(filterEffects({ category: 'hover' }).every((effect) => effect.category === 'hover')).toBe(true);
    expect(filterEffects({ category: 'ambient', selectedOnly: true, selectedIds: ['shimmer', 'gradient-flow'] }).map((effect) => effect.id)).toEqual(['gradient-flow']);
    expect(normalizeEffectIds(['tilt', 'tilt', 'unknown', 'ripple', {}, null])).toEqual(['tilt', 'ripple']);
    expect(normalizeEffectIds('ripple')).toEqual([]);
  });
  it('validates a limited set of design tokens rather than arbitrary CSS injection', () => {
    expect(normalizeDesignConfig(null)).toEqual(defaultDesignConfig);
    expect(normalizeDesignConfig({ accent: 'url(javascript:evil)', radius: 'round', speed: 14 })).toEqual({ ...defaultDesignConfig, radius: 'round' });
    expect(designCssVariables({ ...defaultDesignConfig, accent: 'blue', speed: 'fast' })['--pa-fx-duration']).toBe('220ms');
    expect(designCssVariables({ ...defaultDesignConfig, accent: 'blue' })['--pa-fx-accent']).toBe('#475bc5');
    expect(describeDesignConfig(defaultDesignConfig).length).toBe(4);
  });
  it('distinguishes live controls and engineering decisions', () => {
    expect(configurationDimensions.length).toBeGreaterThanOrEqual(10);
    expect(configurationDimensions.some((item) => item.status.includes('业务'))).toBe(true);
  });
});

describe('Effect Studio: end-to-end selected-spec model', () => {
  it('includes effect triggers, reduced-motion rules and design choices in AI brief', () => {
    const prompt = generatePatternPrompt({ ...params, effectIds: ['fade-up', 'ripple'], design: { ...defaultDesignConfig, motion: 'off' } });
    expect(prompt).toContain('渐显上移');
    expect(prompt).toContain('点击涟漪');
    expect(prompt).toContain('减少动态');
    expect(prompt).toContain('关闭装饰运动');
    expect(prompt).toContain('Bento 非对称网格');
  });
  it('preserves old prompt behavior without optional effect configuration', () => {
    const prompt = generatePatternPrompt({ ...params });
    expect(prompt).not.toContain('三、设计参数与视觉特效');
    expect(prompt).toContain('三、实施要求');
  });
  it('exports/imports portable JSON with fixed version and sanitized options', () => {
    const exported = buildUiBrief({ projectName: ' demo ', patternIds: ['bento', 'not-real'], effectIds: ['tilt', 'made-up', 'tilt'], design: defaultDesignConfig, notes: '审阅颜色' });
    const imported = parseUiBrief(JSON.stringify(exported));
    expect(imported).toEqual({ ...exported, projectName: 'demo', effectIds: ['tilt'], patternIds: ['bento'] });
    expect(parseUiBrief(JSON.stringify({ ...exported, effectIds: ['fake', 'ripple'], design: { accent: '#abc' } })).effectIds).toEqual(['ripple']);
    expect(parseUiBrief(JSON.stringify({ ...exported, effectIds: ['fake', 'ripple'], design: { accent: '#abc' } })).design).toEqual(defaultDesignConfig);
    expect(() => parseUiBrief('{}')).toThrow('配置版本');
    expect(() => parseUiBrief('{broken')).toThrow('JSON');
    expect(() => parseUiBrief(' '.repeat(200_001))).toThrow('过大');
  });
});

describe('Pattern Atlas: compiler-safe composition bridge', () => {
  it('only maps explicitly supported patterns to existing Registry kinds', async () => {
    const { buildCompositionSnippet, isCompilableLayout, serializeCompositionSnippet } = await import('../bridge');
    expect(isCompilableLayout('bento')).toBe(true);
    expect(isCompilableLayout('master-detail')).toBe(true);
    expect(isCompilableLayout('kanban')).toBe(false);
    expect(buildCompositionSnippet('kanban')).toBeUndefined();
    const bento = buildCompositionSnippet('bento');
    expect(bento?.kind).toBe('layout');
    expect(bento?.type).toBe('stack');
    expect(JSON.parse(serializeCompositionSnippet('bento') ?? '{}').id).toBe('patternAtlasRoot');
    const master = buildCompositionSnippet('master-detail');
    expect(master?.children?.[1]?.type).toBe('split');
    expect(master?.children?.[1]?.children).toHaveLength(2);
  });
});
