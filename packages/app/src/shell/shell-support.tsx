import { Breadcrumb, Button, Menu, Space, Typography, type MenuProps } from 'antd';
import { resolveDefaultText } from '@foundation/core';
import { evaluatePermission, useAuth } from '@foundation/security';
import { useTheme } from '@foundation/theme';
import { useLocation, useMatches, useNavigate } from 'react-router';
import { useNavigationModel } from '../routing/navigation-context';
import type { NavigationItem } from '../routing/navigation';
import type { FoundationRouteHandle } from '../routing/route-types';
import type { ApplicationShellOptions } from './shell-types';

function hasAccess(item: NavigationItem, auth: ReturnType<typeof useAuth>): boolean {
  if (!item.permissions.length) return true;
  if (auth.status !== 'authenticated') return false;
  const permissions = new Set(auth.user.permissions ?? []);
  return item.permissions.every((requirement) => evaluatePermission(requirement, permissions));
}

function menuItems(navigation: readonly NavigationItem[], auth: ReturnType<typeof useAuth>): NonNullable<MenuProps['items']> {
  return navigation.flatMap((item) => {
    if (!hasAccess(item, auth)) return [];
    const children = item.children ? menuItems(item.children, auth).filter(Boolean) : undefined;
    if (item.children?.length && !children?.length) return [];
    return [{
      key: item.path,
      label: resolveDefaultText(item.label),
      ...(children?.length ? { children } : {})
    }];
  });
}

export function ShellNavigation(props: { mode: 'inline' | 'horizontal'; theme?: 'light' | 'dark' }) {
  const navigation = useNavigationModel();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Menu
      mode={props.mode}
      theme={props.theme ?? 'light'}
      selectedKeys={[location.pathname]}
      items={menuItems(navigation, auth)}
      onClick={({ key }) => navigate(key)}
      style={props.mode === 'horizontal' ? { flex: 1, minWidth: 0, borderBottom: 0 } : undefined}
    />
  );
}

export function ShellBreadcrumbs({ hidden }: { hidden?: boolean }) {
  const matches = useMatches();
  if (hidden) return null;
  const items = matches
    .map((match) => {
      const meta = (match.handle as FoundationRouteHandle | undefined)?.foundation;
      if (meta?.breadcrumb === false) return null;
      const label = meta?.breadcrumb && meta.breadcrumb.label ? meta.breadcrumb.label : meta?.title;
      return label ? { title: resolveDefaultText(label) } : null;
    })
    .filter((item): item is { title: string } => item !== null);
  return <Breadcrumb items={items} />;
}

export function ShellActions({ options }: { options: Readonly<ApplicationShellOptions> }) {
  const auth = useAuth();
  const theme = useTheme();
  return (
    <Space>
      {options.showThemeToggle === false ? null : (
        <Button size="small" onClick={() => theme.setMode(theme.resolvedMode === 'dark' ? 'light' : 'dark')}>
          {theme.resolvedMode === 'dark' ? '浅色' : '深色'}
        </Button>
      )}
      {options.showIdentity === false || auth.status !== 'authenticated'
        ? null
        : <Typography.Text>{auth.user.displayName ?? auth.user.id}</Typography.Text>}
    </Space>
  );
}

export function useShellLayout(options: Readonly<ApplicationShellOptions>) {
  const theme = useTheme();
  const layout = theme.brand?.layout;
  return {
    sidebarWidth: options.sidebarWidth ?? layout?.sidebarWidth ?? 220,
    headerHeight: options.headerHeight ?? layout?.headerHeight ?? 64,
    contentPadding: options.contentPadding ?? layout?.contentPadding ?? 24,
    contentMaxWidth: options.contentMaxWidth ?? layout?.contentMaxWidth
  };
}
