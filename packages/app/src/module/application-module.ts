import type { FoundationRouteObject } from '../routing/route-types';

export interface ApplicationModule {
  id: string;
  featureFlag?: string;
  routes: readonly FoundationRouteObject[];
}

export function defineModule<T extends ApplicationModule>(module: T): T { return module; }
