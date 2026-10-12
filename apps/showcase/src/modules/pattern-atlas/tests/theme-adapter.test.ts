import { describe, expect, it } from 'vitest';
import { defaultDesignConfig, normalizeDesignConfig } from '../effects/config';
import { buildUiBrief, parseUiBrief } from '../effects/brief';
import { foundationThemeUsageSource, toFoundationThemeExport } from '../center/theme-adapter';
import { generatePatternPrompt } from '../prompt';

const base = { projectName: 'Pilot', patternIds: ['bento'], effectIds: [], notes: 'Keep existing app contracts', design: defaultDesignConfig };

describe('Phase 4: safe Foundation Theme adapter', () => {
  it('maps documented public provider props and AntD tokens only', () => {
    const result = toFoundationThemeExport(defaultDesignConfig);
    expect(result.format).toBe('foundation-pattern-atlas-theme');
    expect(result.version).toBe(1);
    expect(result.providerProps.defaultMode).toBe('light');
    expect(result.providerProps.defaultDensity).toBe('default');
    expect(result.providerProps.brand).toEqual({
      primaryColor: '#11765c', borderRadius: 16,
      fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif',
      token: {
        colorPrimary: '#11765c', borderRadius: 16,
        fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif', fontSize: 14,
        boxShadow: '0 8px 26px rgba(18, 48, 39, 0.09)',
        boxShadowSecondary: '0 8px 26px rgba(18, 48, 39, 0.09)'
      }, layout: { contentPadding: 20 }
    });
  });
  it('honors dark, compact and strong preset parameters', () => {
    const result = toFoundationThemeExport({ ...defaultDesignConfig, accent: 'coral', surface: 'dark', density: 'compact', radius: 'square', typeScale: 'large', spacing: 'airy', elevation: 'strong' });
    expect(result.providerProps.defaultMode).toBe('dark');
    expect(result.providerProps.defaultDensity).toBe('compact');
    expect(result.providerProps.brand.primaryColor).toBe('#b34d42');
    expect(result.providerProps.brand.token?.fontSize).toBe(16);
    expect(result.providerProps.brand.borderRadius).toBe(4);
    expect(result.providerProps.brand.layout?.contentPadding).toBe(28);
    expect(result.providerProps.brand.token?.boxShadow).toContain('44px');
  });
  it('keeps motion and speed explicitly unmapped instead of passing illegal props', () => {
    const result = toFoundationThemeExport({ ...defaultDesignConfig, motion: 'off', speed: 'fast' });
    expect(result.previewOnly).toEqual({ motion: 'off', speed: 'fast' });
    expect(JSON.stringify(result.providerProps)).not.toContain('motion');
    expect(JSON.stringify(result.providerProps)).not.toContain('speed');
  });
  it('rejects unknown values through DesignConfig normalization; never leaks raw CSS', () => {
    const input = normalizeDesignConfig({ accent: 'url(http://untrusted)', font: '</style>', density: 'malicious', spacing: 100 });
    const result = toFoundationThemeExport(input);
    expect(result.providerProps.brand.primaryColor).toBe('#11765c');
    expect(result.providerProps.brand.fontFamily).toContain('system-ui');
    expect(result.providerProps.brand.layout?.contentPadding).toBe(20);
    expect(JSON.stringify(result)).not.toContain('untrusted');
  });
  it('produces a reproducible TSX usage example with real provider type narrowing', () => {
    const source = foundationThemeUsageSource(defaultDesignConfig);
    expect(source).toContain("import { FoundationThemeProvider } from '@foundation/theme';");
    expect(source).toContain('as const;');
    expect(source).toContain('<FoundationThemeProvider {...themeProps}>');
    expect(source).toContain('saved user theme/density settings take precedence');
  });
  it('derives the same theme from imported Phase 2 v1 and Phase 3 v2 briefs', () => {
    const old = { ...base, format: 'foundation-pattern-atlas-brief', version: 1 };
    const migrated = parseUiBrief(JSON.stringify(old));
    const v2 = parseUiBrief(JSON.stringify(buildUiBrief(base)));
    expect(toFoundationThemeExport(migrated.design)).toEqual(toFoundationThemeExport(v2.design));
    expect(migrated.version).toBe(2);
  });
  it('preserves previous prompt behavior unless the bridge is explicitly requested', () => {
    const options = { projectName: 'Demo', style: '简洁专业' as const, stack: 'React', selectedIds: ['bento'], notes: '', design: defaultDesignConfig };
    expect(generatePatternPrompt(options)).not.toContain('主题实施：');
    expect(generatePatternPrompt({ ...options, themeBridge: true })).toContain('FoundationThemeProvider');
  });
});
