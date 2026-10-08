import { describe, expect, it } from 'vitest';
import { collectNavigation } from '../src/routing/navigation';
import type { FoundationRouteObject } from '../src';

const routes: readonly FoundationRouteObject[] = [
  {
    id: 'workspace.root',
    path: 'workspace',
    handle: { foundation: { permission: 'workspace.read' } },
    children: [
      {
        id: 'workspace.overview',
        path: 'overview',
        handle: { foundation: { title: 'Overview', navigation: { order: 20 } } }
      },
      {
        id: 'workspace.settings',
        path: 'settings',
        handle: {
          foundation: {
            title: 'Settings',
            permission: 'workspace.settings.read',
            navigation: { label: 'Settings', order: 10 }
          }
        }
      }
    ]
  }
];

describe('collectNavigation', () => {
  it('flattens non-navigation layout routes and preserves inherited permissions', () => {
    const items = collectNavigation(routes);
    expect(items.map((item) => item.id)).toEqual(['workspace.settings', 'workspace.overview']);
    expect(items[0]).toMatchObject({ path: '/workspace/settings' });
    expect(items[0]?.permissions).toEqual(['workspace.read', 'workspace.settings.read']);
    expect(items[1]?.permissions).toEqual(['workspace.read']);
  });
});
