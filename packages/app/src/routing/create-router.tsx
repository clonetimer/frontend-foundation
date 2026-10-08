import { createBrowserRouter, createHashRouter, isRouteErrorResponse, Outlet, useRouteError, type RouteObject } from 'react-router';
import { AppError, normalizeError } from '@foundation/core';
import { resolveApplicationShell } from '../shell/resolve-shell';
import type { ApplicationShell } from '../shell/shell-types';
import { RouteAccessBoundary } from './route-access-boundary';
import { ErrorState, NotFoundState } from '@foundation/ui';
import type { FoundationRouteObject } from './route-types';

function Access() { return <RouteAccessBoundary />; }
function NotFound() { return <NotFoundState />; }
function RouteError() {
  const raw = useRouteError();
  const error = isRouteErrorResponse(raw)
    ? new AppError({ kind: raw.status === 404 ? 'not-found' : raw.status === 403 ? 'authorization' : raw.status >= 500 ? 'server' : 'unknown', message: raw.statusText || `HTTP ${raw.status}`, status: raw.status })
    : normalizeError(raw);
  return <ErrorState error={error} title="页面加载失败" />;
}

export function createFoundationRouter(options: {
  routes: readonly FoundationRouteObject[];
  mode: 'browser' | 'hash';
  basename?: string;
  shell?: ApplicationShell;
}) {
  const shell = resolveApplicationShell(options.shell);
  const Shell = shell.component;
  function Root() {
    return <Shell options={shell.options}><Outlet /></Shell>;
  }
  const root: RouteObject = {
    id: 'foundation.root',
    path: '/',
    Component: Root,
    ErrorBoundary: RouteError,
    children: [
      {
        id: 'foundation.access',
        Component: Access,
        children: [...options.routes] as RouteObject[]
      },
      { id: 'foundation.not-found', path: '*', Component: NotFound }
    ]
  };
  const create = options.mode === 'hash' ? createHashRouter : createBrowserRouter;
  return create([root], options.basename ? { basename: options.basename } : undefined);
}
