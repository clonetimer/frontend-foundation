import type { ComponentType, ReactNode } from 'react';

export type ApplicationShellPreset = 'sidebar' | 'top-nav' | 'workspace' | 'bare';

export interface ApplicationShellOptions {
  /** Override the theme/default navigation width for shells with side navigation. */
  sidebarWidth?: number;
  /** Override the theme/default application header height. */
  headerHeight?: number;
  /** Override the theme/default content padding. */
  contentPadding?: number;
  /** Constrain content width for document-like screens. Omit for fluid layouts. */
  contentMaxWidth?: number;
  /** Hide generated breadcrumbs while keeping the rest of the shell chrome. */
  showBreadcrumbs?: boolean;
  /** Hide the built-in light/dark mode toggle. */
  showThemeToggle?: boolean;
  /** Hide the authenticated user identity in the shell chrome. */
  showIdentity?: boolean;
}

export interface ApplicationShellProps {
  children?: ReactNode;
  options: Readonly<ApplicationShellOptions>;
}

export type ApplicationShellComponent = ComponentType<ApplicationShellProps>;

export interface ApplicationShellDefinition {
  /** Built-in shell preset. Ignored when `component` is provided. */
  preset?: ApplicationShellPreset;
  /** Project-owned shell implementation. It receives routed content as `children`. */
  component?: ApplicationShellComponent;
  options?: ApplicationShellOptions;
}

export type ApplicationShell = ApplicationShellPreset | ApplicationShellDefinition;
