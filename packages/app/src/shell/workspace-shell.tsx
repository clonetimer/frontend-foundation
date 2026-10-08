import { Layout, Typography, theme as antdTheme } from 'antd';
import { useRuntimeConfig } from '../runtime-config/context';
import { ShellActions, ShellBreadcrumbs, ShellNavigation, useShellLayout } from './shell-support';
import type { ApplicationShellProps } from './shell-types';

/**
 * Dense shell for engineering/data/agent workspaces. Navigation remains stable
 * while the routed content receives the remaining viewport and can own its
 * internal split panes, editors, charts, and consoles.
 */
export function WorkspaceShell({ children, options }: ApplicationShellProps) {
  const config = useRuntimeConfig();
  const geometry = useShellLayout({ ...options, contentPadding: options.contentPadding ?? 16, sidebarWidth: options.sidebarWidth ?? 248 });
  const { token } = antdTheme.useToken();
  return (
    <Layout style={{ minHeight: '100vh', height: '100vh', overflow: 'hidden' }}>
      <Layout.Sider width={geometry.sidebarWidth} style={{ overflow: 'auto' }}>
        <Typography.Text strong style={{ display: 'block', color: 'white', padding: '18px 20px' }}>{config.app.name}</Typography.Text>
        <ShellNavigation mode="inline" theme="dark" />
      </Layout.Sider>
      <Layout style={{ minWidth: 0, minHeight: 0 }}>
        <Layout.Header style={{
          height: geometry.headerHeight,
          lineHeight: `${geometry.headerHeight}px`,
          background: token.colorBgContainer,
          paddingInline: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${token.colorBorderSecondary}`
        }}>
          <ShellBreadcrumbs hidden={options.showBreadcrumbs === false} />
          <ShellActions options={options} />
        </Layout.Header>
        <Layout.Content style={{ minHeight: 0, overflow: 'auto', padding: geometry.contentPadding }}>
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
