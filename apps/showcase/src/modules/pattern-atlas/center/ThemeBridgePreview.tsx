import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Alert, Button, Card, ConfigProvider, Input, Tag, theme as antdTheme, type ThemeConfig } from 'antd';
import type { FoundationThemeExport } from './theme-adapter';

/** Match public Foundation dark/compact algorithms; use Ant Design 6 standard `medium` component sizing. */
export function antdPreviewTheme(preset: FoundationThemeExport): ThemeConfig {
  const { defaultMode, defaultDensity, brand } = preset.providerProps;
  const baseAlgorithm = defaultMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
  const algorithm = defaultDensity === 'compact' ? [baseAlgorithm, antdTheme.compactAlgorithm] : baseAlgorithm;
  return {
    algorithm,
    token: {
      ...(brand.primaryColor ? { colorPrimary: brand.primaryColor } : {}),
      ...(brand.borderRadius !== undefined ? { borderRadius: brand.borderRadius } : {}),
      ...(brand.fontFamily ? { fontFamily: brand.fontFamily } : {}),
      ...(brand.token ?? {})
    },
    ...(brand.components ? { components: brand.components } : {})
  };
}

function ThemeSurface({ enabled, padding, children }: { enabled: boolean; padding: number; children: ReactNode }) {
  const { token } = antdTheme.useToken();
  const style = {
    '--pa-bridge-padding': `${padding}px`,
    '--pa-bridge-bg': token.colorBgLayout,
    '--pa-bridge-text': token.colorText,
    '--pa-bridge-border': token.colorBorderSecondary,
    '--pa-bridge-primary': token.colorPrimary
  } as CSSProperties;
  return <div className="pa-bridge-ant-ui" data-scope={enabled ? 'enabled' : 'inherited'} style={style}>{children}</div>;
}

export function ThemeBridgePreview({ preset, enabled }: { preset: FoundationThemeExport; enabled: boolean }) {
  const [value, setValue] = useState('Pattern Atlas 试点工作台');
  const [saved, setSaved] = useState(false);
  const theme = useMemo(() => antdPreviewTheme(preset), [preset]);
  const { defaultDensity, brand } = preset.providerProps;
  const padding = enabled ? brand.layout?.contentPadding ?? 20 : 20;

  const liveContent: ReactNode = <ThemeSurface enabled={enabled} padding={padding}>
    <div className="pa-bridge-ant-heading"><div><span>ANT DESIGN · COMPONENT PILOT</span><h3>真实组件 · 隔离预览</h3></div><Tag color={enabled ? 'success' : 'default'}>{enabled ? '局部主题已启用' : '沿用外层主题'}</Tag></div>
    <Card title="新建项目" size="small" extra={<Tag color="processing">演示数据</Tag>}>
      <label className="pa-bridge-field" htmlFor="pa-bridge-name">项目名称</label>
      <Input id="pa-bridge-name" value={value} maxLength={80} onChange={(event) => { setValue(event.target.value); setSaved(false); }} placeholder="请输入项目名称"/>
      <div className="pa-bridge-actions"><Button type="primary" disabled={!value.trim()} onClick={() => setSaved(true)}>模拟保存</Button><Button onClick={() => { setValue('Pattern Atlas 试点工作台'); setSaved(false); }}>重置表单</Button></div>
      {saved && <Alert type="success" showIcon message={`已在本地模拟保存「${value.trim()}」`} />}
      <p className="pa-bridge-ant-note">按钮、输入框、卡片和反馈区采用 Ant Design 主题算法；没有请求后端。</p>
    </Card>
  </ThemeSurface>;

  // A nested ConfigProvider modifies only this subtree; disabling it immediately restores
  // the surrounding Foundation theme. It does NOT change localStorage or ThemeContext.
  return enabled ? <ConfigProvider theme={theme} componentSize={defaultDensity === 'compact' ? 'small' : 'middle'}>{liveContent}</ConfigProvider> : liveContent;
}
