import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { antdPreviewTheme } from '../center/ThemeBridgePreview';
import { toFoundationThemeExport } from '../center/theme-adapter';
import type { DesignConfig } from '../effects/config';

function ScopedBody({ children, padding, variant }: { children: ReactNode; padding: number; variant: 'live' | 'compare' }) {
  const { token } = antdTheme.useToken();
  const style = {
    '--pa-pilot-bg': token.colorBgContainer,
    '--pa-pilot-ink': token.colorText,
    '--pa-pilot-muted': token.colorTextSecondary,
    '--pa-pilot-border': token.colorBorderSecondary,
    '--pa-pilot-primary': token.colorPrimary,
    '--pa-pilot-padding': `${padding}px`
  } as CSSProperties;
  return <div className="pa-pilot-themed" data-variant={variant} style={style}>{children}</div>;
}

/** Applies only to the wrapped Records subtree; never nests a FoundationThemeProvider. */
export function ScopedRecordsTheme({ design, variant = 'live', children }: {
  design: DesignConfig; variant?: 'live' | 'compare'; children: ReactNode;
}) {
  const preset = useMemo(() => toFoundationThemeExport(design), [design]);
  const config = useMemo(() => antdPreviewTheme(preset), [preset]);
  const density = preset.providerProps.defaultDensity;
  const padding = preset.providerProps.brand.layout?.contentPadding ?? 20;
  return <ConfigProvider theme={config} componentSize={density === 'compact' ? 'small' : 'middle'}>
    <ScopedBody padding={padding} variant={variant}>{children}</ScopedBody>
  </ConfigProvider>;
}
