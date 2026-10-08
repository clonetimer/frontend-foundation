import { AppError } from '@foundation/core';
import type { ApplicationModule } from './application-module';
import type { FoundationRouteObject } from '../routing/route-types';

const MODULE_ID = /^[a-z][a-z0-9-]*$/;
const ROUTE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function enabled(flag: string | undefined, features: Readonly<Record<string, boolean>>): boolean {
  return !flag || features[flag] === true;
}

function filterRoutes(routes: readonly FoundationRouteObject[], features: Readonly<Record<string, boolean>>): FoundationRouteObject[] {
  const output: FoundationRouteObject[] = [];
  for (const route of routes) {
    if (!enabled(route.handle?.foundation?.featureFlag, features)) continue;
    if ('children' in route && route.children) {
      output.push({ ...route, children: filterRoutes(route.children, features) } as FoundationRouteObject);
    } else {
      output.push(route);
    }
  }
  return output;
}

function validateRoute(route: FoundationRouteObject, features: Readonly<Record<string, boolean>>, routeIds: Set<string>): void {
  if (!ROUTE_ID.test(route.id)) {
    throw new AppError({ kind: 'configuration', message: `Invalid route id: ${route.id}` });
  }
  if (route.id.startsWith('foundation.')) {
    throw new AppError({ kind: 'configuration', message: `Route id uses reserved prefix: ${route.id}` });
  }
  if (routeIds.has(route.id)) {
    throw new AppError({ kind: 'configuration', message: `Duplicate route id: ${route.id}` });
  }
  routeIds.add(route.id);

  const flag = route.handle?.foundation?.featureFlag;
  if (flag && !(flag in features)) {
    throw new AppError({ kind: 'configuration', message: `Unknown feature flag on route ${route.id}: ${flag}` });
  }

  if (!route.index && route.path?.startsWith('/')) {
    throw new AppError({ kind: 'configuration', message: `Application route paths must be relative: ${route.id}` });
  }

  const navigation = route.handle?.foundation?.navigation;
  if (navigation && !navigation.hidden) {
    if (!route.index && !route.path) {
      throw new AppError({ kind: 'configuration', message: `Navigable route requires path or index: ${route.id}` });
    }
    if (!route.index && route.path && /[:*]/.test(route.path)) {
      throw new AppError({ kind: 'configuration', message: `Parameterized or wildcard route cannot be direct navigation: ${route.id}` });
    }
  }

  if ('children' in route && route.children) {
    for (const child of route.children) validateRoute(child, features, routeIds);
  }
}

export function validateModules(modules: readonly ApplicationModule[], features: Readonly<Record<string, boolean>>): void {
  const moduleIds = new Set<string>();
  const routeIds = new Set<string>();

  for (const module of modules) {
    if (!MODULE_ID.test(module.id)) {
      throw new AppError({ kind: 'configuration', message: `Invalid module id: ${module.id}` });
    }
    if (moduleIds.has(module.id)) {
      throw new AppError({ kind: 'configuration', message: `Duplicate module id: ${module.id}` });
    }
    moduleIds.add(module.id);

    if (module.featureFlag && !(module.featureFlag in features)) {
      throw new AppError({ kind: 'configuration', message: `Unknown feature flag on module ${module.id}: ${module.featureFlag}` });
    }

    for (const route of module.routes) validateRoute(route, features, routeIds);
  }
}

export function resolveModules(modules: readonly ApplicationModule[], features: Readonly<Record<string, boolean>>): ApplicationModule[] {
  validateModules(modules, features);
  return modules
    .filter((module) => enabled(module.featureFlag, features))
    .map((module) => ({ ...module, routes: filterRoutes(module.routes, features) }));
}
