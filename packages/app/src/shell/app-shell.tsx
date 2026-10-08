import { Layout, theme as antdTheme } from 'antd';
import { useRuntimeConfig } from '../runtime-config/context';
import { ShellActions, ShellBreadcrumbs, ShellNavigation, useShellLayout } from './shell-support';
import type { ApplicationShellProps } from './shell-types';

/** Default compatibility shell. New applications should select an explicit shell preset. */
export function AppShell({ children, options }: ApplicationShellProps) {
  const config = useRuntimeConfig();
  const geometry = useShellLayout(options);
  const { token } = antdTheme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth="0" width={geometry.sidebarWidth}>
        <div style={{ color: 'white', padding: 20, fontWeight: 700 }}>{config.app.name}</div>
        <ShellNavigation mode="inline" theme="dark" />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{
          height: geometry.headerHeight,
          lineHeight: `${geometry.headerHeight}px`,
          background: token.colorBgContainer,
          paddingInline: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <ShellBreadcrumbs hidden={options.showBreadcrumbs === false} />
          <ShellActions options={options} />
        </Layout.Header>
        <Layout.Content style={{ padding: geometry.contentPadding }}>
          <div style={{ width: '100%', maxWidth: geometry.contentMaxWidth, marginInline: geometry.contentMaxWidth ? 'auto' : undefined }}>
            {children}
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
