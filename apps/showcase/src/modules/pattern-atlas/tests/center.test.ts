import { describe, expect, it } from 'vitest';
import { buildUiBrief, parseUiBrief } from '../effects/brief';
import { defaultDesignConfig, designCssVariables, normalizeDesignConfig, describeDesignConfig } from '../effects/config';
import { defaultCenterDraft, normalizeCenterDraft, normalizeEffectBindings, effectTargets, describeCenterDraft } from '../center/model';
import { designPresets } from '../center/presets';
import { generatePatternPrompt } from '../prompt';

const input = { projectName: '工作台', patternIds: ['bento'], effectIds: ['ripple'], design: defaultDesignConfig, notes: '保持可回退' };

describe('Phase 3: design tokens and guardrails', () => {
  it('defines ten typed parameters with safe fallback and four starting presets', () => {
    expect(Object.keys(defaultDesignConfig)).toHaveLength(10);
    expect(designPresets).toHaveLength(4);
    expect(normalizeDesignConfig({ font: 'var(--injected)', typeScale: 'large', elevation: 'strong', spacing: 42 })).toEqual({ ...defaultDesignConfig, typeScale: 'large', elevation: 'strong' });
    for (const preset of designPresets) expect(normalizeDesignConfig(preset.design)).toEqual(preset.design);
    expect(describeDesignConfig(defaultDesignConfig)).toHaveLength(4);
  });
  it('exports only whitelisted CSS variable values', () => {
    const variables = designCssVariables({ ...defaultDesignConfig, font: 'technical', typeScale: 'large', spacing: 'airy', elevation: 'flat' });
    expect(variables['--pa-fx-font']).toContain('monospace');
    expect(variables['--pa-fx-type-scale']).toBe('1.13');
    expect(variables['--pa-fx-layout-space']).toBe('27px');
    expect(variables['--pa-fx-shadow']).toBe('none');
  });
});

describe('Phase 3: target-specific effect bindings', () => {
  it('uses a finite set of known options and compatible triggers', () => {
    expect(effectTargets).toHaveLength(3);
    expect(defaultCenterDraft.bindings).toHaveLength(3);
    const bindings = normalizeEffectBindings([
      { target: 'primary-action', effectId: 'ripple', trigger: 'hover', delayMs: 0 },
      { target: 'primary-action', effectId: 'ripple', trigger: 'click', delayMs: 300 },
      { target: 'primary-action', effectId: 'shine', trigger: 'hover', delayMs: 0 },
      { target: 'status-banner', effectId: 'fade-up', trigger: 'enter', delayMs: 100000 },
      { target: 'feature-card', effectId: 'alert(1)', trigger: 'click', delayMs: 0 },
      { target: 'unknown', effectId: 'hover-lift', trigger: 'hover', delayMs: 0 }
    ]);
    expect(bindings).toEqual([
      { target: 'primary-action', effectId: 'ripple', trigger: 'click', delayMs: 300 },
      { target: 'status-banner', effectId: 'fade-up', trigger: 'enter', delayMs: 0 }
    ]);
  });
  it('rejects malformed state and restores missing bindings using safe defaults', () => {
    expect(normalizeCenterDraft(null)).toEqual(defaultCenterDraft);
    expect(normalizeCenterDraft({ viewport: 'iframe', previewState: 'eval', bindings: 'no' })).toEqual({ viewport: 'desktop', previewState: 'ready', bindings: [] });
    expect(normalizeCenterDraft({ viewport: 'mobile', previewState: 'loading', bindings: [] })).toEqual({ viewport: 'mobile', previewState: 'loading', bindings: [] });
    expect(describeCenterDraft(defaultCenterDraft)).toContain('预览验收：桌面视口、正常状态；真实项目仍须覆盖其他屏幕与状态。');
  });
});

describe('Phase 3: versioned portable specifications', () => {
  it('round-trips v2 briefs including responsive preview and component bindings', () => {
    const brief = buildUiBrief({ ...input, viewport: 'mobile', previewState: 'error', bindings: [
      { target: 'feature-card', effectId: 'hover-lift', trigger: 'hover', delayMs: 150 }
    ] });
    expect(brief.version).toBe(2);
    expect(parseUiBrief(JSON.stringify(brief))).toEqual(brief);
  });
  it('migrates old Phase 2 v1 JSON without discarding old choices', () => {
    const legacy = { ...input, format: 'foundation-pattern-atlas-brief', version: 1 };
    const migrated = parseUiBrief(JSON.stringify(legacy));
    expect(migrated.version).toBe(2);
    expect(migrated.projectName).toBe(input.projectName);
    expect(migrated.patternIds).toEqual(['bento']);
    expect(migrated.effectIds).toEqual(['ripple']);
    expect(migrated.design).toEqual(defaultDesignConfig);
    expect(migrated.bindings).toEqual(defaultCenterDraft.bindings);
  });
  it('supports old six-token design input with new properties defaulted', () => {
    const legacyDesign = { accent: 'coral', surface: 'dark', density: 'compact', radius: 'square', motion: 'off', speed: 'fast' };
    const old = { format: 'foundation-pattern-atlas-brief', version: 1, projectName: '旧项目', patternIds: ['modal'], effectIds: [], notes: '', design: legacyDesign };
    expect(parseUiBrief(JSON.stringify(old)).design).toEqual({ ...defaultDesignConfig, ...legacyDesign });
  });
  it('rejects unsupported future versions and malformed imports', () => {
    expect(() => parseUiBrief(JSON.stringify({ ...buildUiBrief(input), version: 3 }))).toThrow('配置版本');
    expect(() => parseUiBrief('{')).toThrow('JSON');
    expect(() => parseUiBrief(JSON.stringify({ ...buildUiBrief(input), patternIds: 'not-array' }))).toThrow('必要字段');
  });
  it('converts only explicit new preview settings to prompt requirements', () => {
    const params = { projectName: '案例', selectedIds: ['bento'], style: '简洁专业' as const, stack: 'React', notes: '便于调整' };
    const oldPrompt = generatePatternPrompt(params);
    expect(oldPrompt).not.toContain('组件级动效绑定');
    const newPrompt = generatePatternPrompt({ ...params, design: defaultDesignConfig, center: defaultCenterDraft });
    expect(newPrompt).toContain('组件级动效绑定');
    expect(newPrompt).toContain('主操作按钮：点击涟漪');
    expect(newPrompt).toContain('字号：标准');
  });
});
