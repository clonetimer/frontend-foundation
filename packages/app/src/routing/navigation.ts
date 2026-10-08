import { AppError, type UiText } from '@foundation/core';
import type { PermissionRequirement } from '@foundation/security';
import type { FoundationRouteObject } from './route-types';

export interface NavigationItem {
  id: string;
  label: UiText;
  path: string;
  order: number;
  permissions: readonly PermissionRequirement[];
  children?: readonly NavigationItem[];
}

function joinPath(parent: string, path?: string): string {
  if (!path) return parent || '/';
  const cleanParent = parent === '/' ? '' : parent.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${cleanParent}/${cleanPath}`;
}

function collectNavigationInternal(
  routes: readonly FoundationRouteObject[],
  parentPath: string,
  inheritedPermissions: readonly PermissionRequirement[],
  seenPaths: Set<string>
): NavigationItem[] {
  const items: NavigationItem[] = [];

  for (const route of routes) {
    const path = route.index ? (parentPath || '/') : joinPath(parentPath, route.path);
    const meta = route.handle?.foundation;
    const permissions = meta?.permission ? [...inheritedPermissions, meta.permission] : inheritedPermissions;
    const childItems = 'children' in route && route.children
      ? collectNavigationInternal(route.children, path, permissions, seenPaths)
      : [];
    const nav = meta?.navigation;

    if (nav && !nav.hidden) {
      if (seenPaths.has(path)) {
        throw new AppError({
          kind: 'configuration',
          message: `Duplicate navigation path: ${path}`
        });
      }
      seenPaths.add(path);
      items.push({
        id: route.id,
        label: nav.label ?? meta?.title ?? route.id,
        path,
        order: nav.order ?? 100,
        permissions,
        ...(childItems.length ? { children: childItems } : {})
      });
    } else {
      items.push(...childItems);
    }
  }

  return items.sort((a, b) => a.order - b.order);
}

export function collectNavigation(
  routes: readonly FoundationRouteObject[],
  parentPath = '',
  inheritedPermissions: readonly PermissionRequirement[] = []
): NavigationItem[] {
  return collectNavigationInternal(routes, parentPath, inheritedPermissions, new Set<string>());
}
