import type { IndexRouteObject, NonIndexRouteObject } from 'react-router';
import type { UiText } from '@foundation/core';
import type { PermissionRequirement } from '@foundation/security';

export interface NavigationMeta {
  label?: UiText;
  order?: number;
  hidden?: boolean;
}

export interface BreadcrumbMeta { label?: UiText; }

export interface FoundationRouteMeta {
  title?: UiText;
  navigation?: NavigationMeta;
  breadcrumb?: BreadcrumbMeta | false;
  permission?: PermissionRequirement;
  featureFlag?: string;
}

export interface FoundationRouteHandle { foundation?: FoundationRouteMeta; }

export type FoundationIndexRouteObject = Omit<IndexRouteObject, 'id' | 'handle'> & {
  id: string;
  handle?: FoundationRouteHandle;
};

export type FoundationNonIndexRouteObject = Omit<NonIndexRouteObject, 'id' | 'handle' | 'children'> & {
  id: string;
  handle?: FoundationRouteHandle;
  children?: readonly FoundationRouteObject[];
};

export type FoundationRouteObject = FoundationIndexRouteObject | FoundationNonIndexRouteObject;
