import { Layout, Space, Typography, theme as antdTheme } from 'antd';
import { useRuntimeConfig } from '../runtime-config/context';
import { ShellActions, ShellBreadcrumbs, ShellNavigation, useShellLayout } from './shell-support';
import type { ApplicationShellProps } from './shell-types';

export function TopNavShell({ children, options }: ApplicationShellProps) {
  const config = useRuntimeConfig();
  const geometry = useShellLayout(options);
  const { token } = antdTheme.useToken();
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{
        height: geometry.headerHeight,
        lineHeight: `${geometry.headerHeight}px`,
        background: token.colorBgContainer,
        paddingInline: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        borderBottom: `1px solid ${token.colorBorderSecondary}`
      }}>
        <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>{config.app.name}</Typography.Text>
        <ShellNavigation mode="horizontal" />
        <ShellActions options={options} />
      </Layout.Header>
      <Layout.Content style={{ padding: geometry.contentPadding }}>
        <div style={{ width: '100%', maxWidth: geometry.contentMaxWidth, marginInline: geometry.contentMaxWidth ? 'auto' : undefined }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <ShellBreadcrumbs hidden={options.showBreadcrumbs === false} />
            {children}
          </Space>
        </div>
      </Layout.Content>
    </Layout>
  );
}
