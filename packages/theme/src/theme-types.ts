import type { ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';
export type Density = 'default' | 'compact';

export interface LayoutThemeTokens {
  /** Default width used by navigation sidebars. */
  sidebarWidth?: number;
  /** Default application header height. */
  headerHeight?: number;
  /** Default page/workspace content padding. */
  contentPadding?: number;
  /** Optional maximum readable content width. Omit for fluid workspaces. */
  contentMaxWidth?: number;
}

/**
 * Project-level theme contract.
 *
 * `primaryColor`, `borderRadius`, and `fontFamily` remain supported for
 * 0.10/0.11 compatibility. New projects should prefer `token` for broader
 * Ant Design token overrides and `layout` for Foundation shell geometry.
 */
export interface BrandTheme {
  primaryColor?: string;
  borderRadius?: number;
  fontFamily?: string;
  token?: ThemeConfig['token'];
  components?: ThemeConfig['components'];
  layout?: LayoutThemeTokens;
}
